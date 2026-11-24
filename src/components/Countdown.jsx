import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function Countdown({ target, now, size = 'small' }) {
  if (!target) return <div className={`countdown ${size} tba`}>Date TBA</div>;
  const ms = Date.parse(target) - now;
  if (ms <= 0) return <div className={`countdown ${size} live`}>It&rsquo;s live!</div>;

  const s = Math.floor(ms / 1000);
  const parts = [
    ['days', Math.floor(s / 86400)],
    ['hrs', Math.floor((s % 86400) / 3600)],
    ['min', Math.floor((s % 3600) / 60)],
    ['sec', s % 60],
  ];
  return (
    <div className={`countdown ${size}`} role="timer" aria-label={`Drops in ${parts.map(([l, v]) => `${v} ${l}`).join(' ')}`}>
      {parts.map(([label, value]) => (
        <div className="cd-cell" key={label}>
          <span className="cd-num">{String(value).padStart(2, '0')}</span>
          <span className="cd-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
