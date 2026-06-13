import { useState } from 'react';
import SetupScreen from './components/SetupScreen';
import SessionView from './components/SessionView';
import { useJamEngine } from './hooks/useJamEngine';
import './App.css';

function App() {
  const [inSession, setInSession] = useState(false);
  const [genre, setGenre] = useState('blues');
  const [style, setStyle] = useState('supportive');
  const [timeSig, setTimeSig] = useState('4/4');

  const engine = useJamEngine({ style, genre });

  if (!inSession) {
    return (
      <SetupScreen
        onStart={() => setInSession(true)}
        genre={genre}
        style={style}
        timeSig={timeSig}
        onGenreChange={setGenre}
        onStyleChange={setStyle}
        onTimeSigChange={setTimeSig}
      />
    );
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
      genre={genre}
      style={style}
      timeSig={timeSig}
      jamMode={engine.jamMode}
    />
  );
}

export default App;
