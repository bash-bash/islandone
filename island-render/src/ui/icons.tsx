// Hand-drawn SVG icons for the HUD, styled after the reference image: warm, glossy, chunky.

type P = { size?: number };

export function SunIcon({ size = 26 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <radialGradient id="sunG" cx="40%" cy="35%">
          <stop offset="0" stopColor="#fff6b0" />
          <stop offset="1" stopColor="#ffb800" />
        </radialGradient>
      </defs>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="14.6" y="1.5" width="2.8" height="6" rx="1.4" fill="#ffc21a" transform={`rotate(${i * 45} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="7.5" fill="url(#sunG)" stroke="#f0a000" strokeWidth="0.8" />
    </svg>
  );
}

export function HeartIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.2 0 3.6 1.3 4.4 2.6.8-1.3 2.2-2.6 4.4-2.6 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z"
        fill="#ff4a57"
        stroke="#c2202e"
        strokeWidth="0.8"
      />
      <ellipse cx="7.6" cy="8.6" rx="1.8" ry="1.2" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function FoodIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="#ffaa2a" stroke="#c97a08" strokeWidth="0.6">
      <path d="M5 2.5h1v6.2c0 .9.6 1.6 1.4 1.8V21a1.5 1.5 0 0 1-3 0V10.5C3.6 10.3 3 9.6 3 8.7V2.5h1v5h1zM7.5 2.5h1V8.7c0 .4-.2.8-.5 1.1" />
      <path d="M15.5 2.5c2.6 0 4 2.8 4 6.2 0 2.2-1 3.6-2.3 4.1V21a1.5 1.5 0 0 1-3 0V2.9c.4-.3.8-.4 1.3-.4z" />
    </svg>
  );
}

export function DropIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5s-6.5 7.3-6.5 11.8a6.5 6.5 0 0 0 13 0C18.5 9.8 12 2.5 12 2.5z" fill="#2fa8ff" stroke="#1272c7" strokeWidth="0.8" />
      <ellipse cx="9.4" cy="14" rx="1.3" ry="2.2" fill="#fff" opacity="0.5" />
    </svg>
  );
}

export function BoltIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M13.5 1.5 4.5 13.5h6l-1.5 9 9.5-12.5h-6.2z" fill="#ffd21f" stroke="#d29a00" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

export function LogIcon({ size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <g transform="rotate(-35 24 24)">
        <rect x="6" y="16" width="34" height="16" rx="3" fill="#a5582a" />
        <rect x="6" y="16" width="34" height="5" rx="2.5" fill="#c97a43" />
        <path d="M12 26h12M18 22h14" stroke="#7d3f1c" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="40" cy="24" rx="5" ry="8" fill="#e6b278" stroke="#8d4c22" strokeWidth="1.2" />
        <ellipse cx="40" cy="24" rx="2.4" ry="4" fill="none" stroke="#b97d45" strokeWidth="1" />
      </g>
    </svg>
  );
}

export function PlankIcon({ size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <g transform="rotate(-35 24 24)">
        <path d="M5 19h36l3 4-3 4H5z" fill="#c9773a" />
        <path d="M5 27h36l3-4v5l-3 4H5z" fill="#93501f" />
        <path d="M10 22.5h14M20 25h16" stroke="#9a5622" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function StoneIcon({ size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M8 31c0-8 6-15 15-16 9-1 17 4 17 12 0 6-6 9-16 9S8 37 8 31z" fill="#9aa1a7" stroke="#5f666c" strokeWidth="1.2" />
      <path d="M14 24c3-5 8-7 13-7" stroke="#e6eaee" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M10 32c6 3 18 4 28-1" stroke="#6f767c" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function LeafIcon({ size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M8 40C8 20 22 8 42 7c0 20-12 33-34 33z" fill="#48b52c" stroke="#287a17" strokeWidth="1.2" />
      <path d="M8 40 36 13M16 31l-1-8M22 25l-1-9M28 19l-1-7M16 31l9 0M22 25l9 1M28 19l8 0" stroke="#bff09a" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function AxeIcon({ size = 40 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M10 42 30 14" stroke="#8a4a20" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M10 42 30 14" stroke="#b86e36" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 10c4-5 12-7 18-3-1 7-6 12-12 13l-1.5-1z" fill="#c8ced3" stroke="#6a7177" strokeWidth="1.3" />
      <path d="M30 19c3-.6 7-3.5 9.5-8.5" stroke="#f4f6f8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M25 13l6 5" stroke="#5a3418" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function TorchIcon({ size = 40 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <radialGradient id="flameG" cx="50%" cy="70%" r="60%">
          <stop offset="0" stopColor="#fff3a0" />
          <stop offset="0.5" stopColor="#ffb11a" />
          <stop offset="1" stopColor="#ff5a0a" />
        </radialGradient>
      </defs>
      <path d="M12 44 28 20" stroke="#8a4a20" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M25 19l6 4" stroke="#6b3a17" strokeWidth="6" strokeLinecap="round" />
      <path d="M31 4c2 5 9 8 6 15-2 4-8 5-11 2-4-4 0-8 2-10 0 3 2 4 3 3 1-3-1-6 0-10z" fill="url(#flameG)" />
    </svg>
  );
}

export function GearIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="#fff">
      <path d="M10.3 1.5h3.4l.5 2.6c.7.2 1.3.5 1.9.9l2.2-1.5 2.4 2.4-1.5 2.2c.4.6.7 1.2.9 1.9l2.6.5v3.4l-2.6.5c-.2.7-.5 1.3-.9 1.9l1.5 2.2-2.4 2.4-2.2-1.5c-.6.4-1.2.7-1.9.9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.3-.5-1.9-.9l-2.2 1.5-2.4-2.4 1.5-2.2c-.4-.6-.7-1.2-.9-1.9l-2.6-.5v-3.4l2.6-.5c.2-.7.5-1.3.9-1.9L3.4 5.9l2.4-2.4L8 5c.6-.4 1.2-.7 1.9-.9zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" />
    </svg>
  );
}

export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="16" height="16" rx="3" fill={checked ? "#2e7d4f" : "none"} stroke={checked ? "#5fd08c" : "#e8eef2"} strokeWidth="1.6" />
      {checked && <path d="M4.5 9.2 7.6 12.2 13.6 5.8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
