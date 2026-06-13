import { useRef, useState, useCallback, useEffect } from 'react';
import { createAudioEngine } from '../engine/audioEngine.js';
import { createScheduler } from '../engine/scheduler.js';
import { createBrain } from '../engine/bandBrain.js';
import { createJamDirector } from '../engine/jamDirector.js';

export function useJamEngine({ style = 'supportive', genre = 'blues' } = {}) {
  const [listening,    setListening]    = useState(false);
  const [bandPlaying,  setBandPlaying]  = useState(false);
  const [bandReady,    setBandReady]    = useState(false); // count-in done, waiting for first BPM
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

  const engineRef    = useRef(null);
  const schedulerRef = useRef(null);
  const directorRef  = useRef(null);
  const styleRef     = useRef(style);
  useEffect(() => { styleRef.current = style; }, [style]);

  function ensureEngine() {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine({
        onRms:             setRms,
        onBpm:             setBpm,
        onKey:             setMusicKey,
        onEnergy:          setEnergy,
        onStatus:          setStatus,
        onListeningChange: setListening,
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
    const engine = ensureEngine();
    const ok = await engine.start();
    if (!ok) {
      engineRef.current = null;
      setMicBlocked(true);
      return;
    }
    if (!schedulerRef.current) {
      const sched = createScheduler(engine, createBrain({ genre }));
      schedulerRef.current = sched;

      const director = createJamDirector({
        getStyle:     () => styleRef.current,
        onModeChange: setJamMode,
        setMuteMask:  (m) => sched.setMuteMask(m),
      });
      directorRef.current = director;
      sched.setOnBar(director.onBar);
    }
    // count-in fires immediately so the user gets the pulse
    setCountIn(3);
    setIsCountingIn(true);
  }, []);

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
    // keep the AudioContext alive long enough for the ending hit to ring out
    setTimeout(() => engine?.stop(), 800);
    setBandPlaying(false);
    setActiveBeat(-1);
    setChordHistory([]);
    setJamMode(null);
  }, []);

  // append each new key detection to the chord history (last 8 kept)
  useEffect(() => {
    if (!musicKey) return;
    setChordHistory(prev => [...prev, musicKey].slice(-8));
  }, [musicKey]);

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

  return {
    listening, bandPlaying, bandReady,
    bpm, musicKey, chordHistory, rms, energy, activeBeat, status, onsetFlash, micBlocked, countIn,
    jamMode,
    toggleMic,
  };
}
