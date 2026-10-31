import { ImageResponse } from 'next/og'

// Development placeholder icons, generated at build time and labeled "DEV".
const ICONS = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-touch-180.png': { size: 180, maskable: true },
} as const

type IconFile = keyof typeof ICONS

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const icon = ICONS[file as IconFile]
  if (!icon) return new Response('Not found', { status: 404 })

  const { size, maskable } = icon
  const pad = maskable ? size * 0.2 : size * 0.08
  const inner = size - pad * 2
  const toe = inner * 0.16
  const pad3 = inner * 0.36

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: maskable ? '#17624F' : 'transparent',
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: maskable ? 0 : inner * 0.24,
            background: '#17624F',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: inner * 0.04,
          }}
        >
          <div style={{ display: 'flex', gap: toe * 0.4 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: toe,
                  height: toe * 1.2,
                  borderRadius: toe,
                  background: '#DDF2E8',
                  marginTop: i === 1 ? 0 : toe * 0.4,
                }}
              />
            ))}
          </div>
          <div style={{ width: pad3, height: pad3 * 0.8, borderRadius: pad3, background: '#DDF2E8' }} />
          <div
            style={{
              display: 'flex',
              marginTop: inner * 0.03,
              padding: `${inner * 0.01}px ${inner * 0.05}px`,
              borderRadius: inner * 0.04,
              background: '#F2AD69',
              color: '#202B26',
              fontSize: inner * 0.13,
              fontWeight: 700,
              letterSpacing: inner * 0.01,
            }}
          >
            DEV
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  )
}
