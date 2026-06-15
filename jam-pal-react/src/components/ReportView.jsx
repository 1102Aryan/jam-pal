import styles from './ReportView.module.css';

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

function dynLabel(range) {
  return range > 0.5 ? 'Wide' : range > 0.25 ? 'Some' : 'Flat';
}

function pocketSub(t) {
  if (t.firstHalfPocketPct != null && t.secondHalfPocketPct != null) {
    if (t.secondHalfPocketPct >= t.firstHalfPocketPct + 5) return `tightened up ↑ (${t.firstHalfPocketPct}→${t.secondHalfPocketPct}%)`;
    if (t.firstHalfPocketPct >= t.secondHalfPocketPct + 5) return `eased off (${t.firstHalfPocketPct}→${t.secondHalfPocketPct}%)`;
  }
  return `±${t.spreadMs}ms spread`;
}

function feelSub(t) {
  if (t.tendency === 'steady') return 'right on the beat';
  return `~${Math.abs(t.medianOffsetMs)}ms ${t.tendency === 'rushing' ? 'early' : 'late'}`;
}

function Stat({ label, value, sub }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function ReportView({ report, onDone }) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>Jam Pal</div>
        <h1 className={styles.title}>Session report</h1>
      </div>

      {!report ? (
        <p className={styles.empty}>
          No data captured this time — play along with the band and your report
          will show up here.
        </p>
      ) : (
        <>
          <div className={styles.grid}>
            <Stat label="Jam time" value={fmtTime(report.durationSec)} />
            {report.timing && (
              <Stat label="In the pocket" value={`${report.timing.pocketPct}%`} sub={pocketSub(report.timing)} />
            )}
            {report.tempo && (
              <Stat label="Tempo" value={`${report.tempo.meanBpm}`} sub={`BPM · steady ${Math.round(report.tempo.steadiness * 100)}%`} />
            )}
            {report.timing && (
              <Stat label="Feel" value={cap(report.timing.tendency)} sub={feelSub(report.timing)} />
            )}
            {report.chords && (
              <Stat label="Chords" value={report.chords.distinct} sub={report.chords.unique.join(' · ')} />
            )}
            {report.energy && (
              <Stat label="Dynamics" value={dynLabel(report.energy.range)} sub={`range ${Math.round(report.energy.range * 100)}%`} />
            )}
          </div>

          {report.chords?.sequence?.length > 0 && (
            <div className={styles.progression}>
              <span className={styles.progressionLabel}>What you played</span>
              <div className={styles.chordStrip}>
                {report.chords.sequence.map((c, i) => (
                  <span key={i} className={styles.chordChip}>{c}</span>
                ))}
              </div>
            </div>
          )}

          <p className={styles.note}>
            AI session feedback will live here soon — for now, these are your raw numbers.
          </p>
        </>
      )}

      <button className={styles.doneBtn} onClick={onDone}>New session</button>
    </div>
  );
}

export default ReportView;
