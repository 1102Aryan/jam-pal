import { useEffect, useRef } from 'react';
import styles from './SessionView.module.css';

const MODE_LABELS = {
  breakdown: 'Find the 1',
  solo:      'Take the lead',
  call:      'Listen…',
  response:  'Your turn!',
};

const BEATS = [0, 1, 2, 3];

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
  username, onToggleMic,
  genre = 'rock', style = 'supportive', timeSig = '4/4',
  jamMode = null,
}) {
  const isActive = listening || bandPlaying;
  const ringRef  = useRef(null);

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
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        onToggleMic();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleMic]);

  return (
    <div className={styles.console}>
      {countIn !== null && (
        <div className={styles.countInOverlay}>
          <span key={countIn} className={`${styles.countInLabel} ${countIn === 'Play' ? styles.countInPlay : ''}`}>
            {countIn}
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
          <span className={styles.logo}>Jam Pal</span>
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
              {BEATS.map(i => (
                <div
                  key={i}
                  className={`${styles.beatDot} ${activeBeat === i ? styles.beatDotOn : ''}`}
                />
              ))}
            </div>

            {jamMode && (
              <div key={jamMode} className={`${styles.modeBanner} ${styles[`modeBanner_${jamMode}`]}`}>
                {MODE_LABELS[jamMode]}
              </div>
            )}

            <div className={styles.chips}>
              <span className={styles.chip}>genre · {genre}</span>
              <span className={styles.chip}>style · {style}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className={styles.bottomBar}>
        <div className={styles.chords}>
          <span className={styles.chordsIcon}>♩</span>
          {chordsDisplay}
        </div>

        <button
          className={`${styles.playBtn} ${isActive ? styles.playBtnActive : ''}`}
          onClick={onToggleMic}
          aria-label={isActive ? 'Stop' : 'Start'}
        >
          {isActive ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className={styles.rightControls}>
          <span className={styles.timeSig}>{timeSig}</span>
          <span className={styles.shortcut}>
            <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" opacity="0.5">
              <rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <rect x="5" y="8" width="10" height="4" rx="1" />
            </svg>
            space to play
          </span>
        </div>
      </div>
    </div>
  );
}

export default SessionView;
