// Solid "printed ink" icons and sketches for the paper journal (navy ink on parchment).
import type { CSSProperties } from 'react';

const S = { width: '1.35em', height: '1.35em', flex: 'none', display: 'block' } as const;

export type InkName = 'pin' | 'calendar' | 'clock' | 'hourglass' | 'thermo' | 'eye' | 'waves' | 'doc' | 'people' | 'tank' | 'bag' | 'star' | 'diver' | 'sun' | 'moon';

export function Ink({ name, style }: { name: InkName; style?: CSSProperties }) {
  const p = { viewBox: '0 0 24 24', style: { ...S, ...style }, 'aria-hidden': true } as const;
  switch (name) {
    case 'pin':
      return <svg {...p}><path fill="currentColor" fillRule="evenodd" d="M12 1.8a7.2 7.2 0 0 0-7.2 7.2c0 5.4 7.2 13.2 7.2 13.2s7.2-7.8 7.2-13.2A7.2 7.2 0 0 0 12 1.8Zm0 10a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" /></svg>;
    case 'calendar':
      return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path fill="currentColor" d="M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2.6h-17Z" /><path stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M8 3v3.4M16 3v3.4" />{[7, 10.9, 14.8].flatMap((x) => [12.4, 16.2].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="2.2" height="2" rx=".4" fill="currentColor" />))}</svg>;
    case 'clock':
      return <svg {...p}><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2.3" /><path d="M12 7.2V12l3.4 2.2" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'hourglass':
      return <svg {...p}><path fill="currentColor" d="M5.5 2.5h13v2.2h-1.3c0 3.3-2.2 5.3-3.6 7.3 1.4 2 3.6 4 3.6 7.3h1.3v2.2h-13v-2.2h1.3c0-3.3 2.2-5.3 3.6-7.3-1.4-2-3.6-4-3.6-7.3H5.5Zm3.6 2.2c0 2.5 1.7 4.2 2.9 5.9 1.2-1.7 2.9-3.4 2.9-5.9Zm2.9 9.6c-1 1.4-2.4 2.9-2.8 5h5.6c-.4-2.1-1.8-3.6-2.8-5Z" /></svg>;
    case 'thermo':
      return <svg {...p}><path fill="none" stroke="currentColor" strokeWidth="2" d="M9.7 14V4.6a2.3 2.3 0 0 1 4.6 0V14a4.2 4.2 0 1 1-4.6 0Z" /><circle cx="12" cy="17.4" r="2.3" fill="currentColor" /><path stroke="currentColor" strokeWidth="2" d="M12 9v7" /></svg>;
    case 'eye':
      return <svg {...p}><path fill="currentColor" fillRule="evenodd" d="M12 5.2C6.6 5.2 3 9.6 1.8 12c1.2 2.4 4.8 6.8 10.2 6.8S21 14.4 22.2 12C21 9.6 17.4 5.2 12 5.2Zm0 10.6a3.8 3.8 0 1 1 0-7.6 3.8 3.8 0 0 1 0 7.6Zm0-2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" /></svg>;
    case 'waves':
      return <svg {...p}><path fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" d="M2.5 7.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6.5 0M2.5 12.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6.5 0M2.5 17.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6.5 0" /></svg>;
    case 'doc':
      return <svg {...p}><path fill="currentColor" d="M6 2.5h8.5L19.5 7.5V20a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 20V4.1A1.6 1.6 0 0 1 6 2.5Z" /><path fill="none" stroke="#efe2c3" strokeWidth="1.6" strokeLinecap="round" d="M7.6 9.6h8.6M7.6 12.8h8.6M7.6 16h5.6" /><path fill="#efe2c3" d="M14.3 2.5v5.2h5.2" opacity=".55" /></svg>;
    case 'people':
      return <svg {...p}><circle cx="8.6" cy="8" r="3.4" fill="currentColor" /><circle cx="16.4" cy="8.4" r="2.9" fill="currentColor" /><path fill="currentColor" d="M2 19.5c0-3.8 3-6 6.6-6s6.6 2.2 6.6 6Zm14.2 0c0-2.2-.7-3.9-1.9-5.1.7-.4 1.4-.5 2.1-.5 3 0 5.6 1.9 5.6 5.6Z" /></svg>;
    case 'tank':
      return <svg {...p} viewBox="0 0 24 34"><defs><linearGradient id="ink-tank" x1="0" y1="0" x2="0" y2="1"><stop offset=".42" stopColor="transparent" /><stop offset=".42" stopColor="#3f7fc4" /><stop offset="1" stopColor="#2a5d9c" /></linearGradient></defs><rect x="6" y="1" width="12" height="3.2" rx="1" fill="currentColor" /><rect x="9.5" y="3.6" width="5" height="3" fill="currentColor" /><rect x="4.6" y="6.4" width="14.8" height="26" rx="5.6" fill="url(#ink-tank)" stroke="currentColor" strokeWidth="2.2" /><path d="M8 17h8M8 21h8M8 25h8" stroke="#cfe0f2" strokeWidth="1.3" opacity=".7" /></svg>;
    case 'bag':
      return <svg {...p}><path fill="none" stroke="currentColor" strokeWidth="2.2" d="M8.4 8V6.6a3.6 3.6 0 0 1 7.2 0V8" /><rect x="2.6" y="8" width="18.8" height="12.5" rx="3" fill="currentColor" /><path stroke="#efe2c3" strokeWidth="1.6" d="M2.6 13h18.8" opacity=".7" /><rect x="10.2" y="11.6" width="3.6" height="3" rx=".8" fill="#efe2c3" /></svg>;
    case 'star':
      return <svg {...p}><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" /></svg>;
    case 'diver':
      return <svg {...p}><circle cx="17.6" cy="6.8" r="2.6" fill="currentColor" /><path fill="currentColor" d="M2 13.4c1-1.6 3-2.5 5.2-2.3l6.4.6 2.9-1.8c1.2-.8 2.8-.1 3 1.3.2 1-.3 1.9-1.2 2.3l-4.1 2-7.4.2c-1.9.1-3.6-.6-4.8-2.3Z" /><rect x="5.6" y="8.6" width="7.4" height="2.4" rx="1.2" fill="currentColor" /><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M2.6 18.6c1.6 1.2 3.2 1.2 4.8 0s3.2-1.2 4.8 0" /></svg>;
    case 'sun':
      return <svg {...p}><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6" /></svg>;
    case 'moon':
      return <svg {...p}><path fill="currentColor" d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z" /></svg>;
  }
}

/** Pencil sketch of seaweed / soft coral with little leaves. */
export function Seaweed({ style, flip }: { style?: CSSProperties; flip?: boolean }) {
  const leaves: [number, number, number][] = [
    [26, 70, -30], [34, 62, 30], [22, 52, -35], [33, 44, 25], [25, 34, -30], [31, 26, 25], [27, 18, -20],
    [14, 60, -50], [9, 50, -20], [15, 41, -55], [44, 56, 50], [50, 46, 25], [46, 36, 55], [12, 30, -30], [50, 28, 30],
  ];
  return (
    <svg className="doodle" viewBox="0 0 60 92" style={{ ...style, transform: `${style?.transform ?? ''}${flip ? ' scaleX(-1)' : ''}` }} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round">
        <path d="M30 90C29 70 28 50 28 12M28 76C22 66 14 58 11 44M11 44c-1-6 0-12 2-16M29 70c6-8 14-14 18-30M47 40c2-6 2-10 1-14M28 46c-4-4-8-8-12-6M29 34c4-3 8-4 11-2" />
        {leaves.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="2.4" ry="4.4" transform={`rotate(${r} ${x} ${y})`} />)}
        <ellipse cx="28" cy="10" rx="2.6" ry="4.6" />
      </g>
    </svg>
  );
}

export function Bubbles({ style }: { style?: CSSProperties }) {
  return (
    <svg className="doodle" viewBox="0 0 30 46" style={style} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.1"><circle cx="20" cy="9" r="6.5" /><circle cx="9" cy="30" r="5" /><circle cx="17" cy="42" r="2.4" /></g>
      <path d="M17 6.5a3.6 3.6 0 0 1 3-1.6" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7" />
    </svg>
  );
}
