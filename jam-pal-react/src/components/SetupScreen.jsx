import styles from './SetupScreen.module.css';

const STEPS = [
  {
    title: 'Allow your microphone',
    desc: 'Jam Pal listens through your mic to detect what you play. Use headphones when the band is running so the drums don\'t feed back into the mic.',
  },
  {
    title: 'Play your guitar',
    desc: 'Strum chords or pick notes at whatever tempo feels natural. Jam Pal detects your BPM and key in real time — it needs a few seconds to settle on the key.',
  },
  {
    title: 'The band follows you',
    desc: 'Hit play to bring in drums and bass. They track your tempo automatically. Play softer to thin the sound out; dig in and the band fills up.',
  },
];


function SetupScreen({
  onStart,
  genre = 'blues', style = 'supportive', timeSig = '4/4',
  onGenreChange, onStyleChange, onTimeSigChange,

  audioDevices = [], selectedDeviceId, setSelectedDeviceId, onRefreshDevices
}) {
  return (
    <div className={styles.page}>
      <div>
        <div className={styles.logo}>Jam Pal</div>
        <p className={styles.tagline}>A virtual band that listens and follows your playing.</p>
      </div>

      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={i} className={styles.step}>
            <div className={styles.stepNum}>{i + 1}</div>
            <div className={styles.stepBody}>
              <span className={styles.stepTitle}>{s.title}</span>
              <span className={styles.stepDesc}>{s.desc}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.note}>
        <span className={styles.noteAccent}>Best results:</span> play full chords rather than single
        notes — chords give the key detector enough pitch information to be confident.
        Key detection scores are logged to the console (F12) if you want to see the confidence.
      </div>

      <div className={styles.configField}>
        <label className={styles.configLabel}>Audio Input</label>
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId?.(e.target.value)}
          onMouseDown={() => onRefreshDevices?.(true)}
          onFocus={() => onRefreshDevices?.(true)}
          className={styles.selectDropdown}
        >
          {audioDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.configField}>
        <label className={styles.configLabel}>Genre</label>
        <select
          value={genre}
          onChange={(e) => onGenreChange?.(e.target.value)}
          className={styles.selectDropdown}
        >
          <option value="rock"> Rock</option>
          <option value="pop"> Pop</option>
          <option value="shoegaze"> Shoegaze</option>
          <option value="blues"> Blues</option>
        </select>
      </div>

      <div className={styles.configField}>
        <label className={styles.configLabel}>Style</label>
        <select
          value={style}
          onChange={(e) => onStyleChange?.(e.target.value)}
          className={styles.selectDropdown}
        >
          <option value="supportive">Supportive</option>
          <option value="lead">Lead Band</option>
          <option value="ambient">Ambient Space</option>
        </select>
      </div>

      <div className={styles.configField}>
        <label className={styles.configLabel}>Time Sig</label>
        <select
          value={timeSig}
          onChange={(e) => onTimeSigChange?.(e.target.value)}
          className={styles.selectDropdown}
        >
          <option value="4/4">4 / 4</option>
          <option value="3/4">3 / 4</option>
          <option value="2/4">2 / 4</option>
          <option value="6/8">6 / 8</option>
          <option value="12/8">12 / 8</option>
        </select>
      </div>

      <div className={styles.cta}>
        <button className={styles.startBtn} onClick={onStart}>
          Start session
        </button>
        <span className={styles.hint}>You can press Space to start / stop once inside</span>
      </div>
    </div>
  );
}

export default SetupScreen;
