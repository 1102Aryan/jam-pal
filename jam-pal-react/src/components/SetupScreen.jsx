import { useEffect, useRef, useState } from 'react';
import styles from './SetupScreen.module.css';
import jamPalLogo from '../assets/jam_pal.svg';
import RingVisualizer from './RingVisualizer';

const GENRES = [
  { label: 'Blues',    value: 'blues' },
  { label: 'Rock',     value: 'rock' },
  { label: 'Pop',      value: 'pop' },
  { label: 'Jazz',     value: 'jazz' },
  { label: 'R&B',      value: 'rnb' },
  { label: 'Shoegaze', value: 'shoegaze' },
];
const STYLES = [
  { value: 'supportive', label: 'Supportive' },
  { value: 'lead', label: 'Lead' },
  { value: 'trade-off', label: 'Trade-off' },
];
const INSTRUMENTS = [
  { label: 'Guitar',   value: 'guitar' },
  { label: 'Bass',     value: 'bass' },
  { label: 'Keyboard', value: 'keys' },
];
// which part the band drops for each instrument, so it doesn't clash with
// what the player is actually playing (see INSTRUMENT_PROFILES in config.js)
const DROPPED_PART = { bass: 'bass line', keys: 'keys part' };
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

function GuitarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="16" r="4.2" />
      <circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <path d="M10.8 13.2L18 6" />
      <rect x="16.6" y="3.3" width="3" height="5" rx="0.8" transform="rotate(45 18.1 5.8)" />
      <path d="M12.6 11.4l1 1M14 10l1 1" />
    </svg>
  );
}

function BassInstrumentIcon() {
  // bass guitar — body, neck, headstock with tuners (SVG Repo)
  return (
    <svg viewBox="0 0 612 612" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M68.635,513.758l-16.047,16.047l-7.385-7.385l16.047-16.047L68.635,513.758z M70.965,516.073l-16.047,16.048l7.385,7.385 l16.047-16.047L70.965,516.073z M80.688,525.765L64.64,541.813l7.386,7.386l16.048-16.048L80.688,525.765z M74.366,551.555 l7.385,7.387l16.051-16.046l-7.385-7.387L74.366,551.555z M612,28.05c-0.021,10.689-6.912,19.605-17.149,22.186l-2.91,0.734 c-2.638,0.666-4.917,2.407-6.253,4.775l-34.084,60.421c-2.75,4.527-7.587,7.229-12.943,7.229c-2.336,0-4.601-0.512-6.735-1.52 c-2.865-1.354-6.066-2.069-9.255-2.069c-5.784,0-11.223,2.252-15.313,6.342l-8.001,8.001L238.443,400.651 c-3.314,7.421-2.811,13.382,1.526,17.718c6.215,6.217,17.009,5.694,33-1.598c0.631-0.273,1.498-0.689,2.749-1.315 c5.096-2.493,10.363-2.388,14.875,0.281c5.362,3.171,8.91,9.732,9.26,17.123c0.421,8.874-2.922,16.546-10.517,24.141 c-8.877,8.878-29.309,18.901-44.109,24.789c-14.553,5.796-25.327,18.304-28.818,33.457c-5.274,22.95-12.89,41.103-22.637,53.956 c-3.195,5.407-7.084,10.417-11.564,14.896C167.995,598.313,149.1,606.142,129,606.144c-0.002,0-0.009,0-0.012,0 C108.891,606.146,90,598.32,75.791,584.11l-53.747-53.749C7.828,516.146-0.001,497.246,0,477.144 c0.002-20.1,7.83-38.997,22.044-53.209c4.16-4.161,8.776-7.803,13.783-10.88l-0.221-0.207l6.89-3.46 c5.333-2.556,10.923-4.479,16.624-5.722l32.552-11.176c21.921-7.537,38.886-24.268,46.543-45.898 c10.112-28.591,23.34-48.16,40.437-59.823c0.269-0.183,0.788-0.584,1.522-1.144c32.149-24.478,54.388-29.959,66.105-16.292 c1.804,2.107,2.596,4.754,2.29,7.658c-1.052,9.994-16.042,22.718-32.083,34.979c-1.388,1.059-2.584,1.974-3.128,2.428 c-4.006,3.345-8.238,10.7-8.579,18.291c-0.227,5.037,1.25,9.183,4.387,12.32c2.751,2.751,6.523,4.188,11.26,4.294l248.65-241.79 c2.29-2.218,4.001-4.99,4.953-8.022l1.567-4.989c1.689-5.377,5.248-9.945,10.036-12.903l5.072-3.993l-4.282-5.928 c-1.689-2.338-1.164-5.603,1.175-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.03,5.58l15.746-12.393l-4.291-5.938 c-1.689-2.338-1.163-5.603,1.176-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.038,5.59l15.694-12.352l-4.537-6.281 c-1.689-2.338-1.163-5.603,1.174-7.292c2.341-1.688,5.603-1.164,7.292,1.175l4.285,5.932l15.731-12.381l-4.617-6.392 c-1.689-2.338-1.163-5.603,1.175-7.292c2.336-1.688,5.604-1.164,7.291,1.175l4.365,6.042l3.901-3.071 c4.473-3.697,9.771-5.69,15.229-5.69c1.901,0,3.811,0.243,5.678,0.721C605.559,9.141,612.019,17.569,612,28.05z M232.584,425.755 c-3.58-3.579-5.728-7.824-6.46-12.52l-10.534,10.761l-35.482-35.484l31.146-30.286c-3.623-1.229-6.818-3.179-9.47-5.83 c-5.224-5.225-7.795-12.2-7.437-20.176c0.434-9.666,5.385-20.051,12.319-25.84c0.717-0.598,1.875-1.484,3.479-2.71 c25.482-19.476,28-25.982,28.049-27.717c-7.257-8.062-26.069-1.524-51.688,17.983c-0.949,0.722-1.622,1.229-1.966,1.463 c-14.985,10.222-27.258,28.619-36.475,54.677c-8.727,24.653-28.043,43.714-52.997,52.295l-33.452,11.444 c-4.695,1.003-9.311,2.543-13.734,4.584l-0.949,0.464c-6.522,3.174-12.411,7.365-17.502,12.457 c-12.241,12.241-18.983,28.516-18.984,45.825c0,17.311,6.741,33.587,18.983,45.827l53.746,53.749 c12.237,12.235,28.507,18.975,45.814,18.975c0.002,0,0.005,0,0.008,0c17.311-0.003,33.583-6.744,45.825-18.985 c3.931-3.932,7.334-8.334,10.112-13.087l0.383-0.654l0.247-0.232c10.947-14.521,17.276-35.087,20.666-49.834 c4.259-18.495,17.394-33.754,35.133-40.82c17.713-7.046,34.404-16.284,40.587-22.47c5.514-5.514,7.748-10.376,7.47-16.261 c-0.184-3.858-1.81-7.244-4.145-8.626c-1.443-0.854-3.054-0.825-4.924,0.092c-1.427,0.713-2.408,1.182-3.143,1.499 C269.796,429.699,246.946,440.118,232.584,425.755z M601.555,28.029c0.008-4.412-2.249-9.707-8.604-11.333 c-4.044-1.037-8.133-0.014-11.761,2.981l-89.609,70.528l-0.29,0.172c-2.738,1.635-4.773,4.208-5.728,7.25l-1.568,4.989 c-1.473,4.685-4.116,8.967-7.643,12.386L194.982,388.615l20.528,20.528L491.93,126.8l8.04-8.041 c6.064-6.062,14.125-9.401,22.698-9.401c4.722,0,9.467,1.062,13.718,3.071c2.269,1.073,5.009,0.353,6.253-1.631l33.949-60.188 c2.735-4.85,7.401-8.411,12.8-9.772l2.911-0.734C599.117,38.388,601.545,32.526,601.555,28.029z M151.096,503.437l-34.667-34.667 l19.904-19.904L171,483.532L151.096,503.437z M151.095,488.664l5.131-5.132l-19.894-19.895l-5.131,5.132L151.095,488.664z M157.836,465.242l-34.667-34.667l19.904-19.904l34.667,34.668L157.836,465.242z M157.835,450.47l5.131-5.131l-19.894-19.896 l-5.131,5.132L157.835,450.47z M184.433,545.078c0.914,8.087-4.922,15.412-13.01,16.329c-0.555,0.063-1.116,0.094-1.671,0.094 c0,0,0,0-0.001,0c-7.511-0.001-13.813-5.636-14.657-13.105c-0.442-3.917,0.666-7.774,3.124-10.858 c2.457-3.084,5.968-5.026,9.887-5.469c0.553-0.063,1.115-0.095,1.67-0.095C177.285,531.974,183.586,537.608,184.433,545.078z M174.054,546.252c-0.247-2.185-2.086-3.832-4.279-3.832c-0.165,0-0.329,0.008-0.497,0.027c-1.146,0.129-2.173,0.697-2.891,1.6 c-0.719,0.901-1.043,2.03-0.913,3.175c0.247,2.186,2.085,3.834,4.277,3.834c0,0,0,0,0.001,0c0.163,0,0.329-0.008,0.495-0.027 C172.614,550.761,174.322,548.617,174.054,546.252z M160.042,571.396c0.914,8.089-4.922,15.414-13.011,16.329 c-0.554,0.063-1.115,0.094-1.67,0.094c0,0,0,0-0.001,0c-7.511,0-13.813-5.634-14.656-13.104c-0.442-3.917,0.666-7.774,3.123-10.858 c2.458-3.084,5.969-5.027,9.887-5.47c0.554-0.063,1.115-0.094,1.67-0.094C152.893,558.293,159.194,563.926,160.042,571.396z M149.661,572.569c-0.247-2.185-2.086-3.832-4.278-3.832c-0.165,0-0.329,0.008-0.498,0.027c-1.145,0.129-2.173,0.697-2.891,1.6 c-0.719,0.902-1.043,2.03-0.913,3.175c0.247,2.187,2.085,3.834,4.277,3.834c0.165,0,0.331-0.008,0.498-0.027 C148.223,577.078,149.929,574.937,149.661,572.569z" />
    </svg>
  );
}

function KeysInstrumentIcon() {
  // piano keys: white-key dividers full height, black keys as thick strokes up top
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
      <rect x="2" y="4" width="20" height="16" rx="1.5" strokeWidth="1.2" />
      <path d="M6.5 4v16M11 4v16M15.5 4v16" strokeWidth="1" />
      <path d="M9 4v9M13.5 4v9M18 4v9" strokeWidth="2.6" />
    </svg>
  );
}

const INSTRUMENT_ICONS = { guitar: GuitarIcon, bass: BassInstrumentIcon, keys: KeysInstrumentIcon };

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
  genre = 'blues', style = 'supportive', timeSig = '4/4', instrument = 'guitar',
  onGenreChange, onStyleChange, onTimeSigChange, onInstrumentChange,
  audioDevices = [], selectedDeviceId, setSelectedDeviceId, onRefreshDevices,
  outputDevices = [], selectedOutputId = '', setSelectedOutputId,
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

            {outputDevices.length > 0 && (
              <label className={styles.outputRow}>
                <span className={styles.outputLabel}>Output</span>
                <select
                  className={styles.outputSelect}
                  value={selectedOutputId}
                  onChange={(e) => setSelectedOutputId?.(e.target.value)}
                >
                  <option value="">System default</option>
                  {outputDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

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
                <span className={styles.fieldLabel}>Your instrument</span>
                <div className={styles.pillRow}>
                  {INSTRUMENTS.map(i => {
                    const Icon = INSTRUMENT_ICONS[i.value];
                    return (
                      <button key={i.value} type="button"
                        className={`${styles.pill} ${instrument === i.value ? styles.pillActive : ''}`}
                        onClick={() => onInstrumentChange?.(i.value)}
                      >
                        <span className={styles.pillIcon}><Icon /></span>
                        {i.label}
                      </button>
                    );
                  })}
                </div>
                {DROPPED_PART[instrument] && (
                  <p className={styles.fieldHint}>The band will drop its own {DROPPED_PART[instrument]} so it doesn't clash with yours.</p>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Genre</span>
                <div className={styles.pillRow}>
                  {GENRES.map(g => (
                    <button key={g.value} type="button"
                      className={`${styles.pill} ${genre === g.value ? styles.pillActive : ''}`}
                      onClick={() => onGenreChange?.(g.value)}
                    >{g.label}</button>
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
