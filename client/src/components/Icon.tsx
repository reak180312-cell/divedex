import type { SVGProps } from 'react';

// Hand-tuned 24px stroke icons (1.7 stroke) matching the DiveDex reference style.
const P: Record<string, string> = {
  home: 'M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  fish: 'M2.5 12c3.2-4.6 9-6 13.5-3.2L20 6v12l-4-2.8C11.5 18 5.7 16.6 2.5 12Zm9.6-1.2h.01M8 9.5c.8 1.6.8 3.4 0 5',
  log: 'M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM9 8h6M9 12h6M9 16h4M5.5 7H4M5.5 12H4M5.5 17H4',
  sites: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 21h18',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2.2 2.2 0 0 0 4 0',
  left: 'm14.5 5-7 7 7 7',
  right: 'm9.5 5 7 7-7 7',
  down: 'm6 9.5 6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm4.5 12.5 4.8 4.8L19.5 7',
  filter: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  waves: 'M3 8.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 13c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 17.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0',
  ruler: 'm14.5 3.5 6 6-11 11-6-6 11-11ZM7 13l1.8 1.8M9.8 10.2l1.8 1.8M12.6 7.4l1.8 1.8',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z',
  dusk: 'M4 18h16M7 14.5a5 5 0 0 1 10 0M12 4.5v3M5.3 8l1.6 1.6M18.7 8l-1.6 1.6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.4 3.5 5.2',
  tank: 'M9 6.5h6a1.5 1.5 0 0 1 1.5 1.5v11.5A1.5 1.5 0 0 1 15 21H9a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 9 6.5ZM10.5 6.5V4h3v2.5M9 3.5h6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2',
  weight: 'M7.2 8h9.6l2.7 12.5h-15L7.2 8ZM9.5 8a2.5 2.5 0 1 1 5 0',
  note: 'M7 3.5h7.5L18.5 7.5V19A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM14 3.5V8h4.5M8.5 12h7M8.5 15.5h7',
  star: 'm12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z',
  alert: 'M12 4 2.8 19.5h18.4L12 4Zm0 6v4.2m0 2.8h.01',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM21 21l-5.2-5.2',
  camera: 'M4 8h3.2L9 5.5h6L16.8 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6',
  edit: 'm15.5 4.5 4 4L8.5 19.5h-4v-4l11-11Z',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4',
  thermo: 'M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0ZM12 9v7',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  current: 'M3 9h12.5a2.5 2.5 0 1 0-2.5-2.5M3 15h15.5a2.5 2.5 0 1 1-2.5 2.5M3 12h8',
  logout: 'M14.5 4.5H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4.5M10 16.5 14.5 12 10 7.5M14.5 12H3.5',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.3-2.6M19 13a10 10 0 0 0-3-2M2 9.5a15 15 0 0 1 4-2.6M22 9.5A15 15 0 0 0 11 5.6M12 20h.01',
  sync: 'M20 11a8 8 0 0 0-14.3-4.6L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.6L20 15.5M20 20v-4.5h-4.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9h.01',
  external: 'M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5.5H4.5V6H10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z',
  diver: 'M15.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 14l5.5-3.5 4.5 1.5 4-2.5M8.5 10.5 7 6.5l4-1.5M13 12l-2 5 4 2.5M3 20c2.5-1.4 5-1.4 7.5 0s5 1.4 7.5 0 3-1 3-1',
  hourglass: 'M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5',
  layers: 'm12 3.5 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-3.5h.01',
  expand: 'M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5',
  book: 'M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Zm0 0V20',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, strokeWidth = 1.7, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 60 48" aria-hidden="true">
      <defs>
        <linearGradient id="lg-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ff6f8" /><stop offset="1" stopColor="#2fc6da" />
        </linearGradient>
      </defs>
      <path d="M10 22c5-13 22-19 36-11-5 1.4-8.2 4-10 7.6 5.6.8 9.4 3.6 12 7.4C36 28 22 27.5 10 22Z" fill="url(#lg-wave)" />
      <circle cx="37.5" cy="15.8" r="1.8" fill="#06202a" />
      <path d="M4 31c6-5 12-5 18 0s12 5 18 0 12-5 16-2.5" fill="none" stroke="url(#lg-wave)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M8 40c5-4 10-4 15 0s10 4 15 0 9-3.6 12-1.8" fill="none" stroke="url(#lg-wave)" strokeWidth="3.4" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}
