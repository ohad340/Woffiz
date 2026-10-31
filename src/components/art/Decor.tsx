/**
 * Decorative landscape pieces (original inline SVG). All are aria-hidden;
 * nothing here carries meaning that is not also present as text.
 */
import { useArtIds } from './ids'

type ArtProps = { className?: string; style?: React.CSSProperties }

const svgProps = { 'aria-hidden': true, focusable: false } as const
const r2 = (n: number) => Math.round(n * 100) / 100

function LeafDefs({ ids }: { ids: (name: string) => string }) {
  return (
    <defs>
      <radialGradient id={ids('leaf')} cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#8ee06b" />
        <stop offset="55%" stopColor="#4fb446" />
        <stop offset="100%" stopColor="#2f8a35" />
      </radialGradient>
      <linearGradient id={ids('pine')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#3aa85c" />
        <stop offset="100%" stopColor="#1f6e3a" />
      </linearGradient>
      <linearGradient id={ids('trunk')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#b06a33" />
        <stop offset="100%" stopColor="#7a4319" />
      </linearGradient>
    </defs>
  )
}

export function RoundTree({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 80 100" {...svgProps}>
      <LeafDefs ids={ids} />
      <ellipse cx="40" cy="96" rx="24" ry="4.5" fill="#1d2b3a" opacity="0.18" />
      <path d="M34 96 L37 60 L43 60 L46 96 Z" fill={`url(#${ids('trunk')})`} />
      <circle cx="24" cy="54" r="19" fill={`url(#${ids('leaf')})`} />
      <circle cx="56" cy="54" r="19" fill={`url(#${ids('leaf')})`} />
      <circle cx="40" cy="34" r="25" fill={`url(#${ids('leaf')})`} />
      <circle cx="31" cy="24" r="7" fill="#b6f09a" opacity="0.55" />
      <circle cx="56" cy="46" r="3.2" fill="#ff6b6b" />
      <circle cx="26" cy="50" r="3.2" fill="#ff6b6b" />
      <circle cx="44" cy="58" r="3.2" fill="#ff6b6b" />
    </svg>
  )
}

export function Pine({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 60 110" {...svgProps}>
      <LeafDefs ids={ids} />
      <ellipse cx="30" cy="106" rx="20" ry="4" fill="#1d2b3a" opacity="0.18" />
      <rect x="26" y="88" width="8" height="18" rx="2" fill={`url(#${ids('trunk')})`} />
      <path d="M30 2 L50 42 Q30 48 10 42 Z" fill={`url(#${ids('pine')})`} />
      <path d="M30 22 L55 68 Q30 75 5 68 Z" fill={`url(#${ids('pine')})`} />
      <path d="M30 44 L58 92 Q30 99 2 92 Z" fill={`url(#${ids('pine')})`} />
      <path d="M30 2 L37 18 L22 28 Z" fill="#9be8a8" opacity="0.5" />
    </svg>
  )
}

export function Bush({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 90 50" {...svgProps}>
      <LeafDefs ids={ids} />
      <circle cx="24" cy="32" r="18" fill={`url(#${ids('leaf')})`} />
      <circle cx="46" cy="24" r="22" fill={`url(#${ids('leaf')})`} />
      <circle cx="68" cy="32" r="17" fill={`url(#${ids('leaf')})`} />
      <rect x="8" y="32" width="76" height="18" rx="9" fill="#3e9f3a" />
      <circle cx="30" cy="30" r="3.5" fill="#ffd23f" />
      <circle cx="60" cy="28" r="3.5" fill="#ff8fab" />
      <circle cx="46" cy="36" r="3.5" fill="#fff" />
    </svg>
  )
}

export function Flowers({ className, style }: ArtProps) {
  const flower = (x: number, y: number, petal: string) => (
    <g key={`${x}-${y}`}>
      <path d={`M${x} ${y + 4} L${x} ${y + 18}`} stroke="#2f8f4e" strokeWidth="2.5" strokeLinecap="round" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={r2(x + 5 * Math.cos((a * Math.PI) / 180))}
          cy={r2(y + 5 * Math.sin((a * Math.PI) / 180))}
          r="4"
          fill={petal}
        />
      ))}
      <circle cx={x} cy={y} r="3" fill="#ffd23f" />
    </g>
  )
  return (
    <svg className={className} style={style} viewBox="0 0 70 40" {...svgProps}>
      <ellipse cx="35" cy="34" rx="30" ry="6" fill="#4fae3c" />
      {flower(14, 18, '#ff8fab')}
      {flower(34, 10, '#ffffff')}
      {flower(54, 18, '#b388ff')}
    </svg>
  )
}

export function Rock({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 70 44" {...svgProps}>
      <defs>
        <linearGradient id={ids('rock')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4ced8" />
          <stop offset="100%" stopColor="#7d8b99" />
        </linearGradient>
      </defs>
      <path d="M6 40 C2 26 14 10 30 10 C44 4 62 14 64 30 C66 38 60 42 52 42 L12 42 Z" fill={`url(#${ids('rock')})`} />
      <path d="M14 22 C20 14 30 14 34 16 C26 18 20 22 16 28 Z" fill="#e6ecf1" />
    </svg>
  )
}

export function Bridge({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 96 56" {...svgProps}>
      <defs>
        <linearGradient id={ids('plank')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d99257" />
          <stop offset="100%" stopColor="#a35f2a" />
        </linearGradient>
      </defs>
      <path d="M4 42 Q48 16 92 42 L92 52 Q48 28 4 52 Z" fill={`url(#${ids('plank')})`} />
      {[12, 22, 32, 42, 52, 62, 72, 82].map((x) => (
        <path key={x} d={`M${x} ${r2(42 - 26 * (1 - ((x - 48) / 44) ** 2))} l0 10`} stroke="#7a4319" strokeWidth="1.6" />
      ))}
      <path d="M4 32 Q48 6 92 32" stroke="#8a4f22" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M8 31 L8 46 M30 20 L30 36 M66 20 L66 36 M88 31 L88 46" stroke="#8a4f22" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/** Full-height river band for the map; stretches with the path. */
export function River({ className }: ArtProps) {
  const d = 'M50 0 C80 120 20 240 50 360 C80 480 20 600 50 720 C80 840 30 920 50 1000'
  return (
    <svg className={className} viewBox="0 0 100 1000" preserveAspectRatio="none" {...svgProps}>
      <path d={d} stroke="#c9b48a" strokeWidth="58" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={d} stroke="#2e9bd6" strokeWidth="48" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={d} stroke="#58bff0" strokeWidth="36" fill="none" vectorEffect="non-scaling-stroke" />
      <path
        d="M44 0 C74 120 14 240 44 360 C74 480 14 600 44 720 C74 840 24 920 44 1000"
        stroke="#d4f1ff"
        strokeWidth="4"
        strokeDasharray="22 46"
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
