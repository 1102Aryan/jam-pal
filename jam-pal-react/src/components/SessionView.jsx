import { useEffect, useRef, useState } from 'react';
import styles from './SessionView.module.css';
import jamPalLogo from '../assets/jam_pal.svg';

const SHORTCUTS = [
  { keys: ['Space'], label: 'Play / pause the band' },
  { keys: ['R'],     label: 'Start / stop recording' },
  { keys: ['M'],     label: 'Metronome on / metronome off'},
  { keys: ['L'],     label: 'Arm / clear the looper' },
  { keys: ['U'],     label: 'lock bpm / unlock bpm'},
  { keys: ['S'],     label: 'End session'},
  { keys: ['?'],     label: 'Show this shortcut list' },
  { keys: ['Esc'],   label: 'Close this card' },
];

// a keyboard key
function Kbd({ children }) {
  return <span className={styles.kbd}>{children}</span>;
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 16" width="22" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="22" height="14" rx="2.5" />
      <line x1="5" y1="5"  x2="5"  y2="5.01" />
      <line x1="9" y1="5"  x2="9"  y2="5.01" />
      <line x1="13" y1="5" x2="13" y2="5.01" />
      <line x1="17" y1="5" x2="17" y2="5.01" />
      <line x1="7" y1="8"  x2="7"  y2="8.01" />
      <line x1="11" y1="8" x2="11" y2="8.01" />
      <line x1="15" y1="8" x2="15" y2="8.01" />
      <line x1="8" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function MetronomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M8 22h8M10 2h4M12 14l-4-4" />
    </svg>
  );
}

const MODE_LABELS = {
  breakdown: 'Find the 1',
  solo:      'Take the lead',
  call:      'Listen…',
  response:  'Your turn!',
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="10" height="10" rx="2.5" />
    </svg>
  );
}

function DrumIcon() {
  // snare drum with sticks
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="10" rx="8" ry="3" />
      <path d="M4 10v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" />
      <path d="M4 13c1.6 1.2 4.5 2 8 2s6.4-.8 8-2" />
      <path d="M16 7l5-4" />
      <path d="M8 7L3 3" />
    </svg>
  );
}

function BassIcon() {
  // bass guitar — body, neck, headstock with tuners (SVG Repo)
  return (
    <svg viewBox="0 0 612 612" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M68.635,513.758l-16.047,16.047l-7.385-7.385l16.047-16.047L68.635,513.758z M70.965,516.073l-16.047,16.048l7.385,7.385 l16.047-16.047L70.965,516.073z M80.688,525.765L64.64,541.813l7.386,7.386l16.048-16.048L80.688,525.765z M74.366,551.555 l7.385,7.387l16.051-16.046l-7.385-7.387L74.366,551.555z M612,28.05c-0.021,10.689-6.912,19.605-17.149,22.186l-2.91,0.734 c-2.638,0.666-4.917,2.407-6.253,4.775l-34.084,60.421c-2.75,4.527-7.587,7.229-12.943,7.229c-2.336,0-4.601-0.512-6.735-1.52 c-2.865-1.354-6.066-2.069-9.255-2.069c-5.784,0-11.223,2.252-15.313,6.342l-8.001,8.001L238.443,400.651 c-3.314,7.421-2.811,13.382,1.526,17.718c6.215,6.217,17.009,5.694,33-1.598c0.631-0.273,1.498-0.689,2.749-1.315 c5.096-2.493,10.363-2.388,14.875,0.281c5.362,3.171,8.91,9.732,9.26,17.123c0.421,8.874-2.922,16.546-10.517,24.141 c-8.877,8.878-29.309,18.901-44.109,24.789c-14.553,5.796-25.327,18.304-28.818,33.457c-5.274,22.95-12.89,41.103-22.637,53.956 c-3.195,5.407-7.084,10.417-11.564,14.896C167.995,598.313,149.1,606.142,129,606.144c-0.002,0-0.009,0-0.012,0 C108.891,606.146,90,598.32,75.791,584.11l-53.747-53.749C7.828,516.146-0.001,497.246,0,477.144 c0.002-20.1,7.83-38.997,22.044-53.209c4.16-4.161,8.776-7.803,13.783-10.88l-0.221-0.207l6.89-3.46 c5.333-2.556,10.923-4.479,16.624-5.722l32.552-11.176c21.921-7.537,38.886-24.268,46.543-45.898 c10.112-28.591,23.34-48.16,40.437-59.823c0.269-0.183,0.788-0.584,1.522-1.144c32.149-24.478,54.388-29.959,66.105-16.292 c1.804,2.107,2.596,4.754,2.29,7.658c-1.052,9.994-16.042,22.718-32.083,34.979c-1.388,1.059-2.584,1.974-3.128,2.428 c-4.006,3.345-8.238,10.7-8.579,18.291c-0.227,5.037,1.25,9.183,4.387,12.32c2.751,2.751,6.523,4.188,11.26,4.294l248.65-241.79 c2.29-2.218,4.001-4.99,4.953-8.022l1.567-4.989c1.689-5.377,5.248-9.945,10.036-12.903l5.072-3.993l-4.282-5.928 c-1.689-2.338-1.164-5.603,1.175-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.03,5.58l15.746-12.393l-4.291-5.938 c-1.689-2.338-1.163-5.603,1.176-7.292c2.337-1.688,5.604-1.164,7.291,1.175l4.038,5.59l15.694-12.352l-4.537-6.281 c-1.689-2.338-1.163-5.603,1.174-7.292c2.341-1.688,5.603-1.164,7.292,1.175l4.285,5.932l15.731-12.381l-4.617-6.392 c-1.689-2.338-1.163-5.603,1.175-7.292c2.336-1.688,5.604-1.164,7.291,1.175l4.365,6.042l3.901-3.071 c4.473-3.697,9.771-5.69,15.229-5.69c1.901,0,3.811,0.243,5.678,0.721C605.559,9.141,612.019,17.569,612,28.05z M232.584,425.755 c-3.58-3.579-5.728-7.824-6.46-12.52l-10.534,10.761l-35.482-35.484l31.146-30.286c-3.623-1.229-6.818-3.179-9.47-5.83 c-5.224-5.225-7.795-12.2-7.437-20.176c0.434-9.666,5.385-20.051,12.319-25.84c0.717-0.598,1.875-1.484,3.479-2.71 c25.482-19.476,28-25.982,28.049-27.717c-7.257-8.062-26.069-1.524-51.688,17.983c-0.949,0.722-1.622,1.229-1.966,1.463 c-14.985,10.222-27.258,28.619-36.475,54.677c-8.727,24.653-28.043,43.714-52.997,52.295l-33.452,11.444 c-4.695,1.003-9.311,2.543-13.734,4.584l-0.949,0.464c-6.522,3.174-12.411,7.365-17.502,12.457 c-12.241,12.241-18.983,28.516-18.984,45.825c0,17.311,6.741,33.587,18.983,45.827l53.746,53.749 c12.237,12.235,28.507,18.975,45.814,18.975c0.002,0,0.005,0,0.008,0c17.311-0.003,33.583-6.744,45.825-18.985 c3.931-3.932,7.334-8.334,10.112-13.087l0.383-0.654l0.247-0.232c10.947-14.521,17.276-35.087,20.666-49.834 c4.259-18.495,17.394-33.754,35.133-40.82c17.713-7.046,34.404-16.284,40.587-22.47c5.514-5.514,7.748-10.376,7.47-16.261 c-0.184-3.858-1.81-7.244-4.145-8.626c-1.443-0.854-3.054-0.825-4.924,0.092c-1.427,0.713-2.408,1.182-3.143,1.499 C269.796,429.699,246.946,440.118,232.584,425.755z M601.555,28.029c0.008-4.412-2.249-9.707-8.604-11.333 c-4.044-1.037-8.133-0.014-11.761,2.981l-89.609,70.528l-0.29,0.172c-2.738,1.635-4.773,4.208-5.728,7.25l-1.568,4.989 c-1.473,4.685-4.116,8.967-7.643,12.386L194.982,388.615l20.528,20.528L491.93,126.8l8.04-8.041 c6.064-6.062,14.125-9.401,22.698-9.401c4.722,0,9.467,1.062,13.718,3.071c2.269,1.073,5.009,0.353,6.253-1.631l33.949-60.188 c2.735-4.85,7.401-8.411,12.8-9.772l2.911-0.734C599.117,38.388,601.545,32.526,601.555,28.029z M151.096,503.437l-34.667-34.667 l19.904-19.904L171,483.532L151.096,503.437z M151.095,488.664l5.131-5.132l-19.894-19.895l-5.131,5.132L151.095,488.664z M157.836,465.242l-34.667-34.667l19.904-19.904l34.667,34.668L157.836,465.242z M157.835,450.47l5.131-5.131l-19.894-19.896 l-5.131,5.132L157.835,450.47z M184.433,545.078c0.914,8.087-4.922,15.412-13.01,16.329c-0.555,0.063-1.116,0.094-1.671,0.094 c0,0,0,0-0.001,0c-7.511-0.001-13.813-5.636-14.657-13.105c-0.442-3.917,0.666-7.774,3.124-10.858 c2.457-3.084,5.968-5.026,9.887-5.469c0.553-0.063,1.115-0.095,1.67-0.095C177.285,531.974,183.586,537.608,184.433,545.078z M174.054,546.252c-0.247-2.185-2.086-3.832-4.279-3.832c-0.165,0-0.329,0.008-0.497,0.027c-1.146,0.129-2.173,0.697-2.891,1.6 c-0.719,0.901-1.043,2.03-0.913,3.175c0.247,2.186,2.085,3.834,4.277,3.834c0,0,0,0,0.001,0c0.163,0,0.329-0.008,0.495-0.027 C172.614,550.761,174.322,548.617,174.054,546.252z M160.042,571.396c0.914,8.089-4.922,15.414-13.011,16.329 c-0.554,0.063-1.115,0.094-1.67,0.094c0,0,0,0-0.001,0c-7.511,0-13.813-5.634-14.656-13.104c-0.442-3.917,0.666-7.774,3.123-10.858 c2.458-3.084,5.969-5.027,9.887-5.47c0.554-0.063,1.115-0.094,1.67-0.094C152.893,558.293,159.194,563.926,160.042,571.396z M149.661,572.569c-0.247-2.185-2.086-3.832-4.278-3.832c-0.165,0-0.329,0.008-0.498,0.027c-1.145,0.129-2.173,0.697-2.891,1.6 c-0.719,0.902-1.043,2.03-0.913,3.175c0.247,2.187,2.085,3.834,4.277,3.834c0.165,0,0.331-0.008,0.498-0.027 C148.223,577.078,149.929,574.937,149.661,572.569z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.25 16C9.25 14.4812 10.4812 13.25 12 13.25C13.5188 13.25 14.75 14.4812 14.75 16C14.75 17.5188 13.5188 18.75 12 18.75C10.4812 18.75 9.25 17.5188 9.25 16ZM12 14.75C11.3096 14.75 10.75 15.3096 10.75 16C10.75 16.6904 11.3096 17.25 12 17.25C12.6904 17.25 13.25 16.6904 13.25 16C13.25 15.3096 12.6904 14.75 12 14.75Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M5.25 9.30277V8C5.25 4.27208 8.27208 1.25 12 1.25C15.7279 1.25 18.75 4.27208 18.75 8V9.30277C18.9768 9.31872 19.1906 9.33948 19.3918 9.36652C20.2919 9.48754 21.0497 9.74643 21.6517 10.3483C22.2536 10.9503 22.5125 11.7081 22.6335 12.6082C22.75 13.4752 22.75 14.5775 22.75 15.9451V16.0549C22.75 17.4225 22.75 18.5248 22.6335 19.3918C22.5125 20.2919 22.2536 21.0497 21.6517 21.6516C21.0497 22.2536 20.2919 22.5125 19.3918 22.6335C18.5248 22.75 17.4225 22.75 16.0549 22.75H7.94513C6.57754 22.75 5.47522 22.75 4.60825 22.6335C3.70814 22.5125 2.95027 22.2536 2.34835 21.6516C1.74643 21.0497 1.48754 20.2919 1.36652 19.3918C1.24996 18.5248 1.24998 17.4225 1.25 16.0549V15.9451C1.24998 14.5775 1.24996 13.4752 1.36652 12.6082C1.48754 11.7081 1.74643 10.9503 2.34835 10.3483C2.95027 9.74643 3.70814 9.48754 4.60825 9.36652C4.80938 9.33948 5.02317 9.31872 5.25 9.30277ZM6.75 8C6.75 5.10051 9.10051 2.75 12 2.75C14.8995 2.75 17.25 5.10051 17.25 8V9.25344C16.8765 9.24999 16.4784 9.24999 16.0549 9.25H7.94513C7.52161 9.24999 7.12353 9.24999 6.75 9.25344V8ZM4.80812 10.8531C4.07435 10.9518 3.68577 11.1322 3.40901 11.409C3.13225 11.6858 2.9518 12.0743 2.85315 12.8081C2.75159 13.5635 2.75 14.5646 2.75 16C2.75 17.4354 2.75159 18.4365 2.85315 19.1919C2.9518 19.9257 3.13225 20.3142 3.40901 20.591C3.68577 20.8678 4.07435 21.0482 4.80812 21.1469C5.56347 21.2484 6.56459 21.25 8 21.25H16C17.4354 21.25 18.4365 21.2484 19.1919 21.1469C19.9257 21.0482 20.3142 20.8678 20.591 20.591C20.8678 20.3142 21.0482 19.9257 21.1469 19.1919C21.2484 18.4365 21.25 17.4354 21.25 16C21.25 14.5646 21.2484 13.5635 21.1469 12.8081C21.0482 12.0743 20.8678 11.6858 20.591 11.409C20.3142 11.1322 19.9257 10.9518 19.1919 10.8531C18.4365 10.7516 17.4354 10.75 16 10.75H8C6.56459 10.75 5.56347 10.7516 4.80812 10.8531Z" fill="currentColor" />
    </svg>
  )
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

const LOOP_TITLE = {
  off:       'Loop a 4-bar progression',
  arming:    'Get ready — recording starts on the next bar',
  recording: 'Recording your progression…',
  playing:   'Looping — solo over it (click to clear)',
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

// Live rush/drag meter. avgMs < 0 = rushing (early), > 0 = dragging (late).
function TimingMeter({ timing }) {
  if (!timing) return null;
  const { avgMs, tightness } = timing;
  const clamped = Math.max(-60, Math.min(60, avgMs));
  const pos     = 50 + (clamped / 60) * 50; // 0–100% across the track
  const inPocket = Math.abs(avgMs) <= 20;
  const label = inPocket ? 'In the pocket' : avgMs < 0 ? 'Rushing' : 'Dragging';

  return (
    <div className={styles.timing}>
      <span className={styles.timingEnd}>rush</span>
      <div className={styles.timingTrack}>
        <div className={styles.timingCenter} />
        <div
          className={`${styles.timingDot} ${inPocket ? styles.timingDotOk : ''}`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <span className={styles.timingEnd}>drag</span>
      <span className={styles.timingStat}>{label} · {Math.round(tightness * 100)}%</span>
    </div>
  );
}

// "A minor" → "Am", "F major" → "F", "C♯ minor" → "C♯m"
function formatChord(key) {
  if (!key) return '—';
  const [note, mode] = key.split(' ');
  return mode === 'minor' ? note + 'm' : note;
}

const EMPTY_SLOTS = ['—', '—', '—', '—'];

function SessionView({
  bpm, musicKey, activeBeat, listening, bandPlaying, micBlocked, countIn,
  chordHistory = [],
  username, onToggleMic, onEndSession,
  genre = 'rock', style = 'supportive', timeSig = '4/4',
  jamMode = null,
  timing = null,
  isRecording = false, onToggleRecording,
  isMetronomeOn = false, onToggleMetronome,
  isLockOn = false, onToggleLock,
  loopStatus = { mode: 'off' }, onToggleLoop,
  drumVolume = 0.85, bassVolume = 1.0, onDrumVolume, onBassVolume,
}) {
  const isActive = listening || bandPlaying;
  const ringRef  = useRef(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // beat dots follow the time signature: 4/4 → 4, 3/4 → 3, 6/8 → 6
  const beatCount = Number((timeSig ?? '4/4').split('/')[0]) || 4;

  // pad history to 4 slots, newest on the right
  const slots = [...EMPTY_SLOTS];
  chordHistory.slice(-4).forEach((k, i) => {
    slots[4 - Math.min(chordHistory.length, 4) + i] = formatChord(k);
  });
  const chordsDisplay = slots.join(' — ');

  // pulse the ring on every beat change
  useEffect(() => {
    if (activeBeat === null || activeBeat === undefined) return;
    const el = ringRef.current;
    if (!el) return;
    el.classList.remove(styles.ringPulse);
    void el.offsetWidth; // force reflow so animation restarts each beat
    el.classList.add(styles.ringPulse);
  }, [activeBeat]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if focused on text field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      // Esc closes the shortcuts card; "?" opens it
      if (e.code === 'Escape') { setShowShortcuts(false); return; }
      if (e.key === '?')       { setShowShortcuts((v) => !v); return; }
      // don't fire actions while the shortcuts card is open
      if (showShortcuts) return;

      if (e.code === 'Space') {       // Play / pause
        e.preventDefault();
        onToggleMic();
      }
      if (e.code === 'KeyR') {        // Record
        e.preventDefault();
        onToggleRecording();
      }
      if (e.code === 'KeyL') {        // Loop
        e.preventDefault();
        onToggleLoop();
      }
      if (e.code === 'KeyS') {        // End session
        e.preventDefault();
        onEndSession();
      }
      if (e.code === 'KeyU') {
        e.preventDefault();
        onToggleLock();
      }
      if (e.code === 'keyM') {
        e.preventDefault();
        onToggleMetronome
      }

    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleMic, onToggleRecording, onToggleLoop, showShortcuts]);



  return (
    <div className={styles.console}>
      {countIn !== null && (
        <div className={styles.countInOverlay}>
          <span key={countIn} className={`${styles.countInLabel} ${countIn === 'Play' ? styles.countInPlay : ''}`}>
            {countIn}
          </span>
        </div>
      )}

      {jamMode && (
        <div className={styles.modeOverlay}>
          <span key={jamMode} className={`${styles.modeLabel} ${styles[`modeLabel_${jamMode}`]}`}>
            {MODE_LABELS[jamMode]}
          </span>
        </div>
      )}

      {micBlocked && (
        <div className={styles.overlay}>
          <div className={styles.overlayBox}>
            <div className={styles.overlayIcon}><MicIcon /></div>
            <h2 className={styles.overlayTitle}>Microphone required</h2>
            <p className={styles.overlayBody}>
              Jam Pal needs access to your microphone to detect your playing and
              keep the band in sync. Please allow access when prompted by your browser.
            </p>
            <button className={styles.overlayBtn} onClick={onToggleMic}>
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.logoItem}>
          <div className={`${styles.statusDot} ${listening ? styles.statusDotActive : ''}`} />
          <img src={jamPalLogo} alt="Jam Pal" className={styles.logo} />
        </div>

        <div className={styles.accountSection}>
          <span className={styles.username}>{username ?? 'guest'}</span>
          <div className={styles.userAvatar}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 1114 0H3z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main console */}
      <div className={styles.main}>
        <div className={styles.ringWrap}>
          {/* visual layers — only these animate */}
          <div className={styles.ring} />
          <div className={styles.ringGlow} />
          <div ref={ringRef} className={styles.ringBeat} />

          {/* content layer — never scales or moves */}
          <div className={styles.ringContent}>
            <div className={styles.bpmRow}>
              <span className={styles.bpmNum}>{bpm ?? '—'}</span>
              <span className={styles.bpmUnit}>BPM</span>
            </div>

            <div className={styles.keyRow}>
              <span className={styles.keyValue}>{musicKey ?? '—'}</span>
              <span className={styles.keyLabel}>KEY</span>
            </div>

            <div className={styles.beats}>
              {Array.from({ length: beatCount }, (_, i) => (
                <div
                  key={i}
                  className={`${styles.beatDot} ${activeBeat === i ? styles.beatDotOn : ''}`}
                />
              ))}
            </div>

            <div className={styles.chips}>
              <span className={styles.chip}>genre · {genre}</span>
              <span className={styles.chip}>style · {style}</span>
            </div>
          </div>
        </div>
      </div>

      {bandPlaying && <TimingMeter timing={timing} />}

      {/* Bottom bar */}
      <div className={styles.bottomBar}>
        <div className={styles.leftStack}>
          <div className={styles.chords}>
            <span className={styles.chordsIcon}>♩</span>
            {chordsDisplay}
          </div>

          <div className={styles.mixer}>
            <label className={styles.fader} title="Drums volume">
              <span className={`${styles.faderIcon} ${styles.faderIconDrums}`}><DrumIcon /></span>
              <input
                type="range" min="0" max="1.5" step="0.01" value={drumVolume}
                aria-label="Drums volume"
                onChange={(e) => onDrumVolume?.(parseFloat(e.target.value))}
              />
            </label>
            <label className={styles.fader} title="Bass volume">
              <span className={`${styles.faderIcon} ${styles.faderIconBass}`}><BassIcon /></span>
              <input
                type="range" min="0" max="1.5" step="0.01" value={bassVolume}
                aria-label="Bass volume"
                onChange={(e) => onBassVolume?.(parseFloat(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className={styles.transport}>
          <div className={styles.transportSide}>
            <button
              className={`${styles.lockBtn} ${isLockOn ? styles.lockBtnActive : ''}`}
              onClick={onToggleLock}
              aria-pressed={isLockOn}
              aria-label={isLockOn ? 'Unlock tempo' : 'Lock tempo'}
              title={isLockOn ? `Tempo locked at ${bpm ?? '—'} BPM — click to unlock` : 'Lock the tempo (manual BPM)'}
            >
              <LockIcon />
            </button>

            <button
              className={`${styles.metronomeBtn} ${isMetronomeOn ? styles.metronomeBtnActive : ''}`}
              onClick={onToggleMetronome}
              aria-label={isMetronomeOn ? 'On metronome' : 'Off metronome'}
              title={isMetronomeOn ? 'On metronome' : 'Off metronome'}
            >
              <MetronomeIcon />
            </button>

            <button
              className={`${styles.loopBtn} ${styles[`loopBtn_${loopStatus.mode}`] ?? ''}`}
              onClick={onToggleLoop}
              disabled={!bandPlaying}
              aria-label="Loop progression"
              title={LOOP_TITLE[loopStatus.mode] ?? LOOP_TITLE.off}
            >
              {loopStatus.mode === 'recording'
                ? <span className={styles.loopCount}>{loopStatus.bar}</span>
                : <LoopIcon />}
            </button>
          </div>

          <button
            className={`${styles.playBtn} ${isActive ? styles.playBtnActive : ''}`}
            onClick={onToggleMic}
            aria-label={isActive ? 'Stop' : 'Start'}
          >
            {isActive ? <PauseIcon /> : <PlayIcon />}
          </button>

          <div className={`${styles.transportSide} ${styles.transportSideRight}`}>
            <button
              className={styles.endBtn}
              onClick={onEndSession}
              aria-label="End session and see report"
              title="End session — see your report"
            >
              <StopIcon />
            </button>

            <button
              className={`${styles.recordBtn} ${isRecording ? styles.recordBtnActive : ''}`}
              onClick={onToggleRecording}
              disabled={!isActive}
              aria-label={isRecording ? 'Stop recording' : 'Record'}
              title={isRecording ? 'Stop recording' : 'Record this jam'}
            >
              <RecordIcon />
            </button>
          </div>
        </div>

        <div className={styles.rightControls}>
          <span className={styles.timeSig}>{timeSig}</span>
          <button
            className={styles.shortcut}
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <KeyboardIcon />
            Shortcuts
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className={styles.overlay} onClick={() => setShowShortcuts(false)}>
          <div className={styles.shortcutsCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.shortcutsHead}>
              <h2 className={styles.shortcutsTitle}>Keyboard shortcuts</h2>
              <button className={styles.shortcutsClose} onClick={() => setShowShortcuts(false)} aria-label="Close">×</button>
            </div>
            <ul className={styles.shortcutsList}>
              {SHORTCUTS.map((s) => (
                <li key={s.label} className={styles.shortcutsRow}>
                  <span className={styles.shortcutKeys}>
                    {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                  </span>
                  <span className={styles.shortcutDesc}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionView;
