import { useArtIds } from './ids'
import styles from './Mascot.module.css'

/**
 * The app's puppy mascot: golden-brown fur, blue bandana. Original inline SVG
 * (no network request, scales cleanly). Always decorative — pair it with real text.
 */
type MascotProps = {
  pose?: 'wave' | 'sit' | 'head' | 'back'
  className?: string
}

type Ids = (name: string) => string
const paint = (ids: Ids) => ({
  FUR: `url(#${ids('fur')})`,
  EAR: `url(#${ids('ear')})`,
  CREAM: `url(#${ids('cream')})`,
  BANDANA: `url(#${ids('bandana')})`,
  IRIS: `url(#${ids('iris')})`,
})
const LINE = { stroke: '#7a3f14', strokeOpacity: 0.45, strokeWidth: 2.2, strokeLinejoin: 'round' as const }

function Defs({ ids }: { ids: Ids }) {
  return (
    <defs>
      <radialGradient id={ids('fur')} cx="38%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ffcf86" />
        <stop offset="45%" stopColor="#eea250" />
        <stop offset="100%" stopColor="#c8762f" />
      </radialGradient>
      <radialGradient id={ids('ear')} cx="40%" cy="20%" r="90%">
        <stop offset="0%" stopColor="#d98b44" />
        <stop offset="100%" stopColor="#9c5420" />
      </radialGradient>
      <radialGradient id={ids('cream')} cx="50%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#f7e2c6" />
      </radialGradient>
      <linearGradient id={ids('bandana')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4a9cf5" />
        <stop offset="100%" stopColor="#1e5fc2" />
      </linearGradient>
      <radialGradient id={ids('iris')} cx="50%" cy="65%" r="60%">
        <stop offset="0%" stopColor="#a8622a" />
        <stop offset="100%" stopColor="#4a2610" />
      </radialGradient>
    </defs>
  )
}

function Eye({ cx, ids }: { cx: number; ids: Ids }) {
  const { IRIS } = paint(ids)
  return (
    <g>
      <ellipse cx={cx} cy="84" rx="12" ry="14" fill="#24140b" />
      <ellipse cx={cx} cy="86" rx="9.5" ry="11.5" fill={IRIS} />
      <ellipse cx={cx} cy="86" rx="5.5" ry="7" fill="#160b05" />
      <circle cx={cx + 4} cy="79" r="4.6" fill="#fff" />
      <circle cx={cx - 4} cy="92" r="2" fill="#fff" opacity="0.9" />
    </g>
  )
}

function Ears({ ids }: { ids: Ids }) {
  const { EAR } = paint(ids)
  return (
    <>
      <path d="M58 48 C38 44 22 70 26 102 C29 124 45 134 57 121 C66 110 68 80 70 58 Z" fill={EAR} {...LINE} />
      <path d="M142 48 C162 44 178 70 174 102 C171 124 155 134 143 121 C134 110 132 80 130 58 Z" fill={EAR} {...LINE} />
    </>
  )
}

function Head({ ids }: { ids: Ids }) {
  const { FUR, CREAM } = paint(ids)
  return (
    <g>
      <ellipse cx="100" cy="80" rx="57" ry="51" fill={FUR} {...LINE} />
      <path d="M86 36 C88 22 99 20 101 30 C105 20 116 24 113 37 Z" fill="#eea250" />
      {/* Face blaze */}
      <path
        d="M100 44 C109 44 111 61 113 73 C128 77 140 92 136 109 C132 126 115 132 100 132 C85 132 68 126 64 109 C60 92 72 77 87 73 C89 61 91 44 100 44 Z"
        fill={CREAM}
      />
      <Ears ids={ids} />
      <path d="M66 63 Q76 55 86 61" stroke="#7a3f14" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M134 63 Q124 55 114 61" stroke="#7a3f14" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <Eye cx={78} ids={ids} />
      <Eye cx={122} ids={ids} />
      <ellipse cx="63" cy="107" rx="9" ry="5.5" fill="#ff7f6e" opacity="0.4" />
      <ellipse cx="137" cy="107" rx="9" ry="5.5" fill="#ff7f6e" opacity="0.4" />
      {/* Mouth, tongue, nose */}
      <path d="M82 112 C86 132 114 132 118 112 C111 117 105 115 100 110 C95 115 89 117 82 112 Z" fill="#5e1f2a" />
      <path d="M90 120 C90 139 110 139 110 120 C105 125 95 125 90 120 Z" fill="#ff7088" />
      <path d="M100 123 L100 133" stroke="#d94a63" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M88 100 C88 92 112 92 112 100 C112 107 105 111 100 111 C95 111 88 107 88 100 Z" fill="#24140b" />
      <ellipse cx="95.5" cy="97" rx="3.6" ry="1.9" fill="#fff" opacity="0.75" />
    </g>
  )
}

function Bandana({ ids, collarOnly = false }: { ids: Ids; collarOnly?: boolean }) {
  const { BANDANA } = paint(ids)
  return (
    <g>
      <path d="M57 118 C80 134 120 134 143 118 L142 131 C122 145 78 145 58 131 Z" fill={BANDANA} {...LINE} />
      {!collarOnly && (
        <>
          <path d="M71 134 C90 142 110 142 129 134 L100 173 Z" fill={BANDANA} {...LINE} />
          <path d="M80 138 C92 142 108 142 120 138" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" fill="none" />
          <ellipse cx="100" cy="153" rx="6" ry="5" fill="#fff" />
          <circle cx="92" cy="145.5" r="2.5" fill="#fff" />
          <circle cx="97.5" cy="141.5" r="2.5" fill="#fff" />
          <circle cx="102.5" cy="141.5" r="2.5" fill="#fff" />
          <circle cx="108" cy="145.5" r="2.5" fill="#fff" />
        </>
      )}
    </g>
  )
}

function Body({ ids, wave }: { ids: Ids; wave: boolean }) {
  const { FUR, CREAM } = paint(ids)
  return (
    <g>
      <path d="M144 172 C172 162 182 134 170 116 C165 110 158 114 160 121 C167 138 158 153 138 162 Z" fill={FUR} {...LINE} />
      <ellipse cx="56" cy="199" rx="24" ry="15" fill={FUR} {...LINE} />
      <ellipse cx="144" cy="199" rx="24" ry="15" fill={FUR} {...LINE} />
      <path d="M52 206 C46 160 64 127 100 125 C136 127 154 160 148 206 Z" fill={FUR} {...LINE} />
      <path d="M76 206 C72 170 84 146 100 146 C116 146 128 170 124 206 Z" fill={CREAM} />
      <ellipse cx="47" cy="208" rx="17" ry="8.5" fill={CREAM} {...LINE} />
      <ellipse cx="153" cy="208" rx="17" ry="8.5" fill={CREAM} {...LINE} />
      <rect x="74" y="164" width="23" height="44" rx="11.5" fill={FUR} {...LINE} />
      <ellipse cx="85.5" cy="208" rx="14.5" ry="9" fill={CREAM} {...LINE} />
      {!wave && (
        <>
          <rect x="103" y="164" width="23" height="44" rx="11.5" fill={FUR} {...LINE} />
          <ellipse cx="114.5" cy="208" rx="14.5" ry="9" fill={CREAM} {...LINE} />
        </>
      )}
      {/* Soft shadow where the head meets the body */}
      <ellipse cx="100" cy="132" rx="40" ry="8" fill="#7a3f14" opacity="0.15" />
    </g>
  )
}

function WavingPaw({ ids }: { ids: Ids }) {
  const { FUR, CREAM } = paint(ids)
  return (
    <g>
      <path d="M126 152 C132 126 146 104 158 94 C166 87 178 93 174 105 C166 122 152 142 142 157 Z" fill={FUR} {...LINE} />
      <ellipse cx="165" cy="96" rx="14" ry="13" fill={CREAM} {...LINE} />
      <ellipse cx="165" cy="100" rx="5.5" ry="4.5" fill="#b8643a" />
      <circle cx="158.5" cy="91.5" r="2.5" fill="#b8643a" />
      <circle cx="165" cy="88.5" r="2.5" fill="#b8643a" />
      <circle cx="171.5" cy="91.5" r="2.5" fill="#b8643a" />
    </g>
  )
}

/** Seen from behind, looking up the trail. */
function Back({ ids }: { ids: Ids }) {
  const { FUR, BANDANA } = paint(ids)
  return (
    <g>
      <ellipse cx="56" cy="201" rx="24" ry="14" fill={FUR} {...LINE} />
      <ellipse cx="144" cy="201" rx="24" ry="14" fill={FUR} {...LINE} />
      <path d="M50 206 C44 158 64 124 100 122 C136 124 156 158 150 206 Z" fill={FUR} {...LINE} />
      <path d="M82 200 C70 170 76 140 100 136 C124 140 130 170 118 200 Z" fill="#ffffff" opacity="0.14" />
      <ellipse cx="100" cy="84" rx="54" ry="48" fill={FUR} {...LINE} />
      <Ears ids={ids} />
      <path d="M58 118 C80 132 120 132 142 118 L141 130 C122 142 78 142 59 130 Z" fill={BANDANA} {...LINE} />
      <path d="M96 132 L86 152 L100 146 Z M104 132 L114 152 L100 146 Z" fill={BANDANA} {...LINE} />
      <circle cx="100" cy="133" r="6.5" fill="#1e5fc2" />
      <path
        d="M100 196 C82 184 82 160 96 152 C104 148 110 154 104 160 C96 166 96 182 110 190 Z"
        fill={FUR}
        {...LINE}
      />
      <path d="M100 160 C98 156 100 152 104 152" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

export function Mascot({ pose = 'sit', className }: MascotProps) {
  const ids = useArtIds()
  const cls = [styles.mascot, className].filter(Boolean).join(' ')

  if (pose === 'head') {
    return (
      <svg className={cls} viewBox="20 18 160 128" aria-hidden="true" focusable="false">
        <Defs ids={ids} />
        <Head ids={ids} />
        <Bandana ids={ids} collarOnly />
      </svg>
    )
  }

  return (
    <svg className={cls} viewBox="0 10 200 214" aria-hidden="true" focusable="false">
      <Defs ids={ids} />
      <ellipse cx="100" cy="215" rx="74" ry="7" fill="#1d2b3a" opacity="0.16" />
      {pose === 'back' ? (
        <Back ids={ids} />
      ) : (
        <>
          <Body ids={ids} wave={pose === 'wave'} />
          <Bandana ids={ids} />
          <Head ids={ids} />
          {pose === 'wave' && <WavingPaw ids={ids} />}
        </>
      )}
    </svg>
  )
}

/** Short Hebrew line from the mascot. The text is real content, not decoration. */
export function SpeechBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={[styles.bubble, className].filter(Boolean).join(' ')}>{children}</p>
}
