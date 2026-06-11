function SetupScreen({ onStart }) {
    return (
      <div style={{ padding: 40, color: 'white' }}>
        <h1>Setup Screen</h1>
        <button onClick={onStart}>Start</button>
      </div>
    );
  }
  export default SetupScreen;