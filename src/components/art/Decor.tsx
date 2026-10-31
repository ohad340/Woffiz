import Image from 'next/image'

/**
 * Landscape sprites cut from the supplied asset sheets (public/art), plus a code-drawn river.
 * All are decorative (alt="" / aria-hidden); nothing here carries meaning that is not also text.
 */
type ArtProps = { className?: string; style?: React.CSSProperties }

const svgProps = { 'aria-hidden': true, focusable: false } as const

function sprite(src: string, width: number, height: number) {
  return function Sprite({ className, style }: ArtProps) {
    return (
      <Image className={className} style={style} src={src} alt="" aria-hidden="true" width={width} height={height} unoptimized />
    )
  }
}

export const RoundTree = sprite('/art/tree-round.webp', 354, 417)
export const Pine = sprite('/art/pine.webp', 234, 360)
export const Rock = sprite('/art/rock.webp', 225, 147)
export const Flowers = sprite('/art/bush-flower.webp', 330, 294)
export const Bush = sprite('/art/bush.webp', 288, 180)
export const SignPost = sprite('/art/signpost.webp', 225, 402)

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
