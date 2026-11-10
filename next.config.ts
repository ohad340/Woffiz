import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Service worker headers as in the Next.js PWA guide: always revalidated, same-origin scripts only.
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // The public offline fallback is precached by sw.js; revalidate so each install stores the current copy.
      {
        source: '/offline.html',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]
  },
}

export default nextConfig
