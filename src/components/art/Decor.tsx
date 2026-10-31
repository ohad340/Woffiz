/**
 * Decorative landscape pieces (original inline SVG). All are aria-hidden;
 * nothing here carries meaning that is not also present as text.
 */
import { useArtIds } from './ids'

type ArtProps = { className?: string; style?: React.CSSProperties }

const svgProps = { 'aria-hidden': true, focusable: false } as const
const r2 = (n: number) => Math.round(n * 100) / 100

export function Cloud({ className, style }: ArtProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 120 56" {...svgProps}>
      <path
        d="M18 50 C4 50 2 32 16 30 C14 16 34 10 42 22 C46 6 74 4 78 22 C90 12 108 20 104 34 C118 34 118 50 104 50 Z"
        fill="#fff"
      />
      <path d="M18 50 C10 50 8 44 12 41 C40 46 80 46 110 42 C112 47 110 50 104 50 Z" fill="#d6ecfb" />
    </svg>
  )
}

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

/** End-of-trail marker. Decorative only; it is not a reward. */
export function Trophy({ className, style }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} style={style} viewBox="0 0 120 120" {...svgProps}>
      <defs>
        <linearGradient id={ids('gold')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1a6" />
          <stop offset="45%" stopColor="#ffc62e" />
          <stop offset="100%" stopColor="#d98a00" />
        </linearGradient>
        <radialGradient id={ids('glow')} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#fff6c2" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff6c2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="52" r="56" fill={`url(#${ids('glow')})`} />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
        <path
          key={a}
          d={`M60 52 L${r2(60 + 54 * Math.cos(((a - 4) * Math.PI) / 180))} ${r2(52 + 54 * Math.sin(((a - 4) * Math.PI) / 180))} L${r2(60 + 54 * Math.cos(((a + 4) * Math.PI) / 180))} ${r2(52 + 54 * Math.sin(((a + 4) * Math.PI) / 180))} Z`}
          fill="#fff3a8"
          opacity="0.45"
        />
      ))}
      <path d="M34 82 L86 82 L92 104 L28 104 Z" fill="#9aa6b2" />
      <path d="M34 82 L86 82 L88 88 L32 88 Z" fill="#c9d2da" />
      <path d="M38 24 C26 24 20 32 24 42 C28 52 38 54 44 52" stroke="#e0a100" strokeWidth="6" fill="none" />
      <path d="M82 24 C94 24 100 32 96 42 C92 52 82 54 76 52" stroke="#e0a100" strokeWidth="6" fill="none" />
      <path d="M38 18 L82 18 C82 46 74 60 60 62 C46 60 38 46 38 18 Z" fill={`url(#${ids('gold')})`} stroke="#c07a00" strokeWidth="2" />
      <rect x="54" y="62" width="12" height="12" fill="#e0a100" />
      <rect x="44" y="72" width="32" height="10" rx="3" fill={`url(#${ids('gold')})`} stroke="#c07a00" strokeWidth="2" />
      <ellipse cx="60" cy="40" rx="6" ry="5" fill="#fff" opacity="0.9" />
      <circle cx="53" cy="32" r="2.6" fill="#fff" opacity="0.9" />
      <circle cx="58" cy="28" r="2.6" fill="#fff" opacity="0.9" />
      <circle cx="63" cy="28" r="2.6" fill="#fff" opacity="0.9" />
      <circle cx="68" cy="32" r="2.6" fill="#fff" opacity="0.9" />
      <path d="M44 22 L48 22 L46 44 Z" fill="#fff" opacity="0.45" />
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

/** Hero landscape: hills, trees, fence and a doghouse. Sky comes from the container. */
export function Hills({ className }: ArtProps) {
  const ids = useArtIds()
  return (
    <svg className={className} viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" {...svgProps}>
      <LeafDefs ids={ids} />
      <defs>
        <linearGradient id={ids('hill-far')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3ecaa" />
          <stop offset="100%" stopColor="#95d675" />
        </linearGradient>
        <linearGradient id={ids('hill-near')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9be07a" />
          <stop offset="100%" stopColor="#5fb847" />
        </linearGradient>
        <linearGradient id={ids('roof')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff7b6b" />
          <stop offset="100%" stopColor="#c94236" />
        </linearGradient>
        <linearGradient id={ids('house')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f2b06b" />
          <stop offset="100%" stopColor="#cf8240" />
        </linearGradient>
      </defs>
      <path d="M0 112 C60 72 120 84 180 104 C240 64 320 64 400 98 L400 200 L0 200 Z" fill={`url(#${ids('hill-far')})`} />
      <g>
        <circle cx="22" cy="96" r="18" fill={`url(#${ids('leaf')})`} />
        <circle cx="48" cy="86" r="24" fill={`url(#${ids('leaf')})`} />
        <circle cx="74" cy="100" r="16" fill={`url(#${ids('leaf')})`} />
        <circle cx="362" cy="80" r="22" fill={`url(#${ids('leaf')})`} />
        <circle cx="388" cy="92" r="16" fill={`url(#${ids('leaf')})`} />
      </g>
      <path d="M0 146 C80 118 160 126 220 140 C290 120 350 122 400 136 L400 200 L0 200 Z" fill={`url(#${ids('hill-near')})`} />
      {/* Doghouse (left of centre, partly behind the fence) */}
      <g transform="translate(-232 4)">
        <ellipse cx="326" cy="153" rx="34" ry="4" fill="#1d2b3a" opacity="0.2" />
        <path d="M298 152 L298 118 L354 118 L354 152 Z" fill={`url(#${ids('house')})`} />
        <path d="M290 122 L326 92 L362 122 L356 126 L326 101 L296 126 Z" fill={`url(#${ids('roof')})`} />
        <path d="M315 152 L315 135 Q326 124 337 135 L337 152 Z" fill="#5a2f12" />
        <circle cx="326" cy="110" r="5" fill="#fff4e4" />
      </g>
      <g fill="#f6dcae" stroke="#d2ab6c" strokeWidth="1.5">
        <rect x="0" y="146" width="128" height="6" rx="3" />
        <rect x="0" y="158" width="128" height="6" rx="3" />
        {[4, 24, 44, 64, 84, 104].map((x) => (
          <path key={x} d={`M${x} 172 L${x} 140 L${x + 6} 133 L${x + 12} 140 L${x + 12} 172 Z`} />
        ))}
      </g>
      <path d="M0 176 C120 164 280 164 400 172 L400 200 L0 200 Z" fill="#5cb144" />
      <g>
        <circle cx="150" cy="184" r="3" fill="#ff8fab" />
        <circle cx="160" cy="190" r="3" fill="#fff" />
        <circle cx="262" cy="184" r="3" fill="#ffd23f" />
        <circle cx="276" cy="190" r="3" fill="#b388ff" />
        <circle cx="40" cy="188" r="3" fill="#fff" />
        <circle cx="372" cy="186" r="3" fill="#ff8fab" />
      </g>
    </svg>
  )
}
