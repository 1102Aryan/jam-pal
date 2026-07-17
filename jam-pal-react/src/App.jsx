import { useState } from 'react';
import SetupScreen from './components/SetupScreen';
import SessionView from './components/SessionView';
import ReportView from './components/ReportView';
import { useJamEngine } from './hooks/useJamEngine';
import './App.css';

function App() {
  const [view, setView] = useState('setup'); // 'setup' | 'session' | 'report'
  const [genre, setGenre] = useState('blues');
  const [style, setStyle] = useState('supportive');
  const [timeSig, setTimeSig] = useState('4/4');
  const [instrument, setInstrument] = useState('guitar');

  const engine = useJamEngine({ style, genre, timeSig, instrument });

  // end the jam (stopping the band if it's running) and show the report
  const endSession = () => {
    if (engine.listening) engine.toggleMic();
    setView('report');
  };

  if (view === 'setup') {
    return (
      <SetupScreen
        onStart={() => setView('session')}
        genre={genre}
        style={style}
        timeSig={timeSig}
        instrument={instrument}
        onGenreChange={setGenre}
        onStyleChange={setStyle}
        onTimeSigChange={setTimeSig}
        onInstrumentChange={setInstrument}
        audioDevices={engine.audioDevices}
        selectedDeviceId={engine.selectedDeviceId}
        setSelectedDeviceId={engine.setSelectedDeviceId}
        outputDevices={engine.outputDevices}
        selectedOutputId={engine.selectedOutputId}
        setSelectedOutputId={engine.setSelectedOutputId}
        onRefreshDevices={engine.refreshDevices}
      />
    );
  }

  if (view === 'report') {
    return <ReportView report={engine.sessionReport} timeSig={timeSig} onDone={() => setView('setup')} />;
  }

  return (
    <SessionView
      bpm={engine.bpm}
      musicKey={engine.musicKey}
      rms={engine.rms}
      energy={engine.energy}
      getFrequencyData={engine.getFrequencyData}
      activeBeat={engine.activeBeat}
      status={engine.status}
      onsetFlash={engine.onsetFlash}
      listening={engine.listening}
      bandPlaying={engine.bandPlaying}
      micBlocked={engine.micBlocked}
      countIn={engine.countIn}
      chordHistory={engine.chordHistory}
      onToggleMic={engine.toggleMic}
      onToggleBand={engine.toggleBand}
      onEndSession={endSession}
      isRecording={engine.isRecording}
      onToggleRecording={engine.toggleRecording}
      isMetronomeOn={engine.isMetronomeOn}
      onToggleMetronome={engine.toggleMetronome}
      isLockOn={engine.isLockOn}
      onToggleLock={engine.toggleLock}
      loopStatus={engine.loopStatus}
      onToggleLoop={engine.toggleLoop}
      genre={genre}
      style={style}
      timeSig={timeSig}
      instrument={instrument}
      jamMode={engine.jamMode}
      timing={engine.timing}
      drumVolume={engine.drumVolume}
      bassVolume={engine.bassVolume}
      keysVolume={engine.keysVolume}
      guitarVolume={engine.guitarVolume}
      masterVolume={engine.masterVolume}
      onDrumVolume={engine.setDrumVolume}
      onBassVolume={engine.setBassVolume}
      onKeysVolume={engine.setKeysVolume}
      onGuitarVolume={engine.setGuitarVolume}
      onMasterVolume={engine.setMasterVolume}
      mutedChannels={engine.mutedChannels}
      soloedChannels={engine.soloedChannels}
      onToggleMute={engine.toggleMute}
      onToggleSolo={engine.toggleSolo}
    />
  );
}

export default App;
