import { useEffect, useRef, useState } from 'react';
import styles from './SetupScreen.module.css';
import jamPalLogo from '../assets/jam_pal.svg';
import RingVisualizer from './RingVisualizer';

const GENRES = ['Blues', 'Rock', 'Pop', 'Shoegaze'];
const STYLES = [
  { value: 'supportive', label: 'Supportive' },
  { value: 'lead', label: 'Lead' },
  { value: 'trade-off', label: 'Trade-off' },
];
const TIME_SIGS = ['4/4', '3/4', '6/8', '12/8'];
const LEVEL_HEIGHTS = [5, 10, 15, 8, 13, 6, 11, 16, 7, 12, 4, 9, 14];
const noopFreqData = () => false;

function MicIcon({ size = 18, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
    </svg>
  );
}

function PaintBrush({ size = 18 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <defs>
        <linearGradient id="rocket-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d4b4" />
          <stop offset="100%" stopColor="#9b6fff" />
        </linearGradient>
      </defs>
      <path strokeLinecap="round" strokeLinejoin="round" stroke='url(#rocket-gradient)' d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
    </svg>


  )
}

function RocketLaunch({ size = 18 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} className={styles.rocketLaunch}>
      <defs>
        <linearGradient id="rocket-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d4b4" />
          <stop offset="100%" stopColor="#9b6fff" />
        </linearGradient>
      </defs>
      <path strokeLinecap="round" strokeLinejoin="round" stroke="url(#rocket-gradient)" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  )
}

function LevelBars() {
  return (
    <div className={styles.levelBars}>
      {LEVEL_HEIGHTS.map((h, i) => (
        <span key={i} className={styles.levelBar} style={{ height: `${h}px`, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={styles.checkIcon}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}


function SetupScreen({
  onStart,
  genre = 'blues', style = 'supportive', timeSig = '4/4',
  onGenreChange, onStyleChange, onTimeSigChange,
  audioDevices = [], selectedDeviceId, setSelectedDeviceId, onRefreshDevices,
}) {
  const [activeStep, setActiveStep] = useState(1);
  const cardRefs = [useRef(null), useRef(null), useRef(null)];

  // On mobile/scroll: use IntersectionObserver to detect which card is centred
  useEffect(() => {
    const observers = cardRefs.map((ref, i) => {
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveStep(i + 1); },
        { threshold: 0.6 },
      );
      if (ref.current) obs.observe(ref.current);
      return obs;
    });
    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <div className={styles.page}>
      {/* Decorative blobs */}
      <div className={styles.blobLeft} />
      <div className={styles.blobRight} />

      {/* Background ring — same RingVisualizer as session, blurred */}
      <div className={styles.bgRingDecor} aria-hidden="true">
        <RingVisualizer
          className={styles.bgRingCanvas}
          getFrequencyData={noopFreqData}
          rms={0}
          energy={0}
          activeBeat={-1}
          listening={false}
          playing={false}
        />
      </div>

      {/* Top nav */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoItem}>
            <img src={jamPalLogo} alt="Jam Pal" className={styles.logo} />
          </div>
          <div className={styles.title}>
            <span className={styles.logoText}>Jam Pal</span>
            <span className={styles.tagline}>A virtual band that listens and follows your playing</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.guestLabel}>guest</span>
          <div className={styles.avatar}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        </div>
      </header>

      <div className={styles.wrapper}>
        {/* Step progress */}
        <nav className={styles.stepper}>
          <div className={styles.stepItem}>
            <div className={`${styles.stepCircle} ${activeStep === 1 ? styles.stepCircleActive : ''}`}>1</div>
            <span className={`${styles.stepLabel} ${activeStep === 1 ? styles.stepLabelActive : ''}`}>Audio Input</span>
          </div>
          <div className={styles.stepLine} />
          <div className={styles.stepItem}>
            <div className={`${styles.stepCircle} ${activeStep === 2 ? styles.stepCircleActive : ''}`}>2</div>
            <span className={`${styles.stepLabel} ${activeStep === 2 ? styles.stepLabelActive : ''}`}>Band Setup</span>
          </div>
          <div className={styles.stepLine} />
          <div className={styles.stepItem}>
            <div className={`${styles.stepCircle} ${activeStep === 3 ? styles.stepCircleActive : ''}`}>3</div>
            <span className={`${styles.stepLabel} ${activeStep === 3 ? styles.stepLabelActive : ''}`}>Start Session</span>
          </div>
        </nav>

        {/* Top row: S1 + S2 */}
        <div className={styles.topRow}>

          {/* S1 — Audio Input */}
          <div className={styles.card} ref={cardRefs[0]} onMouseEnter={() => setActiveStep(1)}>
            <div className={styles.cardHead}>
              <div className={styles.cardIconWrap}>
                <MicIcon size={20} />
              </div>
              <div>
                <h2 className={styles.cardTitle}>Choose your microphone</h2>
                <p className={styles.cardSub}>Select the input source for Jam Pal</p>
              </div>
            </div>

            <div className={styles.deviceList}>
              {audioDevices.length > 0 ? audioDevices.map((d, i) => (
                <button
                  key={d.deviceId}
                  type="button"
                  className={`${styles.deviceRow} ${selectedDeviceId === d.deviceId ? styles.deviceRowActive : ''}`}
                  onClick={() => setSelectedDeviceId?.(d.deviceId)}
                >
                  <MicIcon size={15} className={styles.deviceMicIcon} />
                  <span className={styles.deviceName}>{d.label || `Microphone ${i + 1}`}</span>
                  {selectedDeviceId === d.deviceId ? <CheckIcon /> : <LevelBars />}
                </button>
              )) : (
                <p className={styles.emptyNote}>No devices detected yet — click below after granting access.</p>
              )}
            </div>

            <button type="button" className={styles.refreshBtn} onClick={() => onRefreshDevices?.(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
              Detect devices
            </button>
          </div>

          {/* S2 — Band Setup */}
          <div className={styles.card} ref={cardRefs[1]} onMouseEnter={() => setActiveStep(2)}>
            <div className={styles.cardHead}>
              <PaintBrush size={40}/>
              <div>
                <h2 className={styles.cardTitle}>Shape the band</h2>
                <p className={styles.cardSub}>Customise how your virtual band responds</p>
              </div>
            </div>

            <div className={styles.s2Controls}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Genre</span>
                <div className={styles.pillRow}>
                  {GENRES.map(g => (
                    <button key={g} type="button"
                      className={`${styles.pill} ${genre === g.toLowerCase() ? styles.pillActive : ''}`}
                      onClick={() => onGenreChange?.(g.toLowerCase())}
                    >{g}</button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Style</span>
                <div className={styles.pillRow}>
                  {STYLES.map(s => (
                    <button key={s.value} type="button"
                      className={`${styles.pill} ${style === s.value ? styles.pillActive : ''}`}
                      onClick={() => onStyleChange?.(s.value)}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Time Signature</span>
                <div className={styles.pillRow}>
                  {TIME_SIGS.map(t => (
                    <button key={t} type="button"
                      className={`${styles.pill} ${timeSig === t ? styles.pillActive : ''}`}
                      onClick={() => onTimeSigChange?.(t)}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* S3 — Start (full width) */}
        <div className={`${styles.card} ${styles.bottomCard}`} ref={cardRefs[2]} onMouseEnter={() => setActiveStep(3)}>
          <div className={styles.s3Left}>
            <div className={styles.cardHead}>
              <RocketLaunch size={40} />
              <div>
                <h2 className={styles.cardTitle}>Ready to play?</h2>
                <p className={styles.cardSub}>Use headphones to prevent feedback. Strum a few chords and the band will lock onto your tempo and key within a couple of bars.</p>
              </div>
            </div>
            <div className={styles.tipBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V3h-2zm-2 14a2 2 0 1 1 4 0 2 2 0 0 1-4 0z" />
              </svg>
              <span>Tip: The visualizer will react in real-time to your playing.</span>
            </div>
          </div>

          <div className={styles.s3Right}>
            <button className={styles.startBtn} type="button" onClick={onStart}>
              Start Session →
            </button>
            <p className={styles.hint}>
              Press <kbd className={styles.kbd}>Space</kbd> bar to toggle the band
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SetupScreen;
