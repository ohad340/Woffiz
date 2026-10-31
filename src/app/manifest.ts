import type { MetadataRoute } from 'next'
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from '@/lib/app'

// Icons are development placeholders (labeled "DEV"), not final brand assets.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    lang: 'he',
    dir: 'rtl',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#E4F4FE',
    theme_color: '#5BB8F5',
    icons: [
      { src: '/dev-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/dev-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/dev-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
