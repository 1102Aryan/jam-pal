import { useState } from 'react';
import SetupScreen from './components/SetupScreen';
import SessionView from './components/SessionView';
import { useJamEngine } from './hooks/useJamEngine';
import './App.css';

function App() {
  const [inSession, setInSession] = useState(false);

  const engine = useJamEngine();

  if (!inSession) {
    return <SetupScreen onStart={() => setInSession(true)} />;
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
    />
  );
}

export default App;
