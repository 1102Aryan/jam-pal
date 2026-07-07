import { useRef, useState, useCallback, useEffect } from 'react';
import { createAudioEngine } from '../engine/audioEngine.js';
import { createScheduler } from '../engine/scheduler.js';
import { createBrain } from '../engine/bandBrain.js';
import { createTransformerBrain } from '../engine/transformerBrain.js';
import { createJamDirector } from '../engine/jamDirector.js';
import { createSessionStats } from '../engine/sessionStats.js';
import { METERS } from '../engine/config.js';

export function useJamEngine({ style = 'supportive', genre = 'blues', timeSig = '4/4' } = {}) {
  const [listening,    setListening]    = useState(false);
  const [bandPlaying,  setBandPlaying]  = useState(false);
  const [bandReady,    setBandReady]    = useState(false); 
  const [bpm,          setBpm]          = useState(null);
  const [musicKey,     setMusicKey]     = useState(null);
  const [rms,          setRms]          = useState(0);
  const [energy,       setEnergy]       = useState(0);
  const [activeBeat,   setActiveBeat]   = useState(-1);
  const [status,       setStatus]       = useState('');
  const [onsetFlash,   setOnsetFlash]   = useState(false);
  const [micBlocked,   setMicBlocked]   = useState(false);
  const [countIn,      setCountIn]      = useState(null);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [chordHistory, setChordHistory] = useState([]);
  const [jamMode,      setJamMode]      = useState(null);
  const [timing,       setTiming]       = useState(null);
  const [drumVolume,   setDrumVolState] = useState(0.85);
  const [bassVolume,   setBassVolState] = useState(1.0);
  const [isRecording,  setRecording]    = useState(false);
  const [loopStatus,   setLoopStatus]   = useState({ mode: 'off', bar: 0, bars: 4 });
  const [sessionReport, setSessionReport] = useState(null);
  // Audio Input
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  // Metronome
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  // Lock
  const [isLockOn, setIsLockOn] = useState(false);

  const engineRef    = useRef(null);
  const schedulerRef = useRef(null);
  const directorRef  = useRef(null);
  const statsRef     = useRef(null);
  const brainRef     = useRef(null);
  const styleRef     = useRef(style);
  const timeSigRef   = useRef(timeSig);
  const drumVolRef   = useRef(0.85);
  const bassVolRef   = useRef(1.0);
  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { timeSigRef.current = timeSig; }, [timeSig]);

  const setDrumVolume = useCallback((v) => {
    drumVolRef.current = v;
    setDrumVolState(v);
    engineRef.current?.setDrumVolume(v);
  }, []);
  const setBassVolume = useCallback((v) => {
    bassVolRef.current = v;
    setBassVolState(v);
    engineRef.current?.setBassVolume(v);
  }, []);

  function ensureEngine() {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine({
        onRms:             setRms,
        onBpm: (bpm) => { setBpm(bpm); statsRef.current?.addBpm(bpm); },
        onKey: (k) => { setMusicKey(k); statsRef.current?.addKey(k); },
        onEnergy: (e) => { setEnergy(e); statsRef.current?.addEnergy(e); },
        onStatus:          setStatus,
        onListeningChange: setListening,
        onChord: (label, chordRootPc) => {
          setChordHistory(prev => prev[prev.length - 1] === label ? prev : [...prev, label].slice(-8));
          statsRef.current?.addChord(label);
          // feed the chord onset into the transformer brain for anticipation
          if (chordRootPc != null) {
            const t = engineRef.current?.getAudioCtx?.()?.currentTime ?? 0;
            brainRef.current?.addEvent?.(t, chordRootPc + 48); // encode root as C3..B3 MIDI pitch
          }
        },
        onTiming: (t) => { setTiming(t); statsRef.current?.addTiming(t.offsetMs); },
        onRecordingChange: setRecording,
        onOnset: () => {
          setOnsetFlash(true);
          setTimeout(() => setOnsetFlash(false), 90);
        },
      });
    }
    return engineRef.current;
  }

  const startMic = useCallback(async () => {
    setMicBlocked(false);
    setSessionReport(null);
    statsRef.current = createSessionStats();
    const engine = ensureEngine();
    const meter = METERS[timeSigRef.current] ?? METERS['4/4'];
    engine.setMeter(meter);

    const ok = await engine.start(selectedDeviceId, genre);
    if (!ok) {
      engineRef.current = null;
      setMicBlocked(true);
      return;
    }
    // apply any volume the user set before this session started
    engine.setDrumVolume(drumVolRef.current);
    engine.setBassVolume(bassVolRef.current);
    if (!schedulerRef.current) {
      const brain = import.meta.env.VITE_USE_TRANSFORMER === 'true'
        ? createTransformerBrain({
            genre,
            timeSig: timeSigRef.current,
            onPrediction: (pred) => {
              if (pred?.estimated_bpm != null) {
                engineRef.current?.nudgeBpm?.(pred.estimated_bpm);
              }
            },
          })
        : createBrain({ genre, timeSig: timeSigRef.current });
      brainRef.current = brain;
      const sched = createScheduler(engine, brain, meter);
      schedulerRef.current = sched;

      const director = createJamDirector({
        getStyle:     () => styleRef.current,
        onModeChange: setJamMode,
        setMuteMask:  (m) => sched.setMuteMask(m),
      });
      directorRef.current = director;
      sched.setOnBar(director.onBar);
      sched.setOnLoopStatus(setLoopStatus);
    }
    // count-in fires immediately so the user gets the pulse
    setCountIn(3);
    setIsCountingIn(true);
  }, [selectedDeviceId, genre]);

  const stopMic = useCallback(() => {
    setIsCountingIn(false);
    setCountIn(null);
    setBandReady(false);
    schedulerRef.current?.stop({ ending: true });
    schedulerRef.current = null;
    directorRef.current?.reset();
    directorRef.current = null;
    const engine = engineRef.current;
    engineRef.current = null;
    setListening(false);
    setIsLockOn(false);   // a fresh session starts unlocked (engine is recreated)

    // produce the session report from everything collected this jam
    const report = statsRef.current?.summarize() ?? null;
    statsRef.current = null;
    setSessionReport(report);
    if (report) console.log('[JamPal] Session report', report);

    // keep the AudioContext alive long enough for the ending hit to ring out
    setTimeout(() => engine?.stop(), 800);
    brainRef.current = null;
    setBandPlaying(false);
    setActiveBeat(-1);
    setChordHistory([]);
    setJamMode(null);
    setTiming(null);
    setLoopStatus({ mode: 'off', bar: 0, bars: 4 });
  }, []);

  // Device labels are only exposed after mic permission, so when the user opens
  // the picker we request permission once and re-enumerate to get real names.
  const refreshDevices = useCallback(async (allowPrompt = false) => {
    try {
      const list = async () =>
        (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
      let inputs = await list();
      if (allowPrompt && (inputs.length === 0 || inputs.every(d => !d.label))) {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach(t => t.stop());
        inputs = await list();
      }
      setAudioDevices(inputs);
      setSelectedDeviceId(prev =>
        prev && inputs.some(d => d.deviceId === prev) ? prev : (inputs[0]?.deviceId ?? '')
      );
    } catch (e) {
      console.error('Error fetching devices:', e);
    }
  }, []);

  useEffect(() => {
    refreshDevices(false);
    const onChange = () => refreshDevices(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [refreshDevices]);

  const toggleMetronome = useCallback(() => {
    if (!engineRef.current) return;
    const newState = engineRef.current.toggleMetronome();
    setIsMetronomeOn(newState);
  }, []);

  const toggleLock = useCallback(() => {
    if (!engineRef.current) return;
    const newState = engineRef.current.toggleLock();
    setIsLockOn(newState);
  }, []);



  // count-in ticker — when it finishes, mark bandReady but don't start the band yet
  useEffect(() => {
    if (!isCountingIn || countIn === null) return;

    const beatInterval = (60 / 100) * 1000;

    const timer = setTimeout(() => {
      if      (countIn === 3)      setCountIn(2);
      else if (countIn === 2)      setCountIn(1);
      else if (countIn === 1)      setCountIn('Play');
      else if (countIn === 'Play') {
        setIsCountingIn(false);
        setCountIn(null);
        setBandReady(true); // waiting for first BPM detection
      }
    }, beatInterval);
    return () => clearTimeout(timer);
  }, [isCountingIn, countIn]);

  // once band is ready and user's tempo is detected, snap in and start
  useEffect(() => {
    if (!bandReady || bpm === null) return;
    setBandReady(false);
    if (schedulerRef.current) {
      engineRef.current?.snapToDetectedBPM();
      schedulerRef.current.start((q) => setActiveBeat(q ?? -1));
      setBandPlaying(true);
    }
  }, [bandReady, bpm]);

  const toggleMic = useCallback(
    () => listening ? stopMic() : startMic(),
    [listening, startMic, stopMic]
  );

  const toggleRecording = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return; // recording needs an active session
    if (engine.isRecording()) engine.stopRecording();
    else engine.startRecording();
  }, []);

  const toggleLoop = useCallback(() => {
    schedulerRef.current?.toggleLoop();
  }, []);

  // stable accessor so the visualizer can read FFT each frame without re-renders
  const getFrequencyData = useCallback((t) => engineRef.current?.getFrequencyData?.(t) ?? false, []);

  return {
    listening, bandPlaying, bandReady,
    bpm, musicKey, chordHistory, rms, energy, activeBeat, status, onsetFlash, micBlocked, countIn,
    jamMode, timing, isRecording, loopStatus, sessionReport, isMetronomeOn, toggleMetronome,
    isLockOn, toggleLock,
    drumVolume, bassVolume, audioDevices, selectedDeviceId, setSelectedDeviceId, setDrumVolume, setBassVolume,
    refreshDevices, getFrequencyData,
    toggleMic, toggleRecording, toggleLoop,
  };
}
