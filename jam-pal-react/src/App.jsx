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

  const engine = useJamEngine({ style, genre });

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
        onGenreChange={setGenre}
        onStyleChange={setStyle}
        onTimeSigChange={setTimeSig}
        audioDevices={engine.audioDevices}
        selectedDeviceId={engine.selectedDeviceId}
        setSelectedDeviceId={engine.setSelectedDeviceId}
      />
    );
  }

  if (view === 'report') {
    return <ReportView report={engine.sessionReport} onDone={() => setView('setup')} />;
  }

  return (
    <SessionView
      bpm={engine.bpm}
      musicKey={engine.musicKey}
      rms={engine.rms}
      energy={engine.energy}
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
      jamMode={engine.jamMode}
      timing={engine.timing}
      drumVolume={engine.drumVolume}
      bassVolume={engine.bassVolume}
      onDrumVolume={engine.setDrumVolume}
      onBassVolume={engine.setBassVolume}
    />
  );
}

export default App;
