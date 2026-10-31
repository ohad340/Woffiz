import type { Metadata, Viewport } from 'next'
import '@fontsource/heebo/400.css'
import '@fontsource/heebo/500.css'
import '@fontsource/heebo/700.css'
import '@/styles/tokens.css'
import '@/styles/base.css'
import { APP_NAME, APP_DESCRIPTION } from '@/lib/app'

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/dev-icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/dev-icons/apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false, email: false },
}

export const viewport: Viewport = {
  themeColor: '#FBF8F1',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          דילוג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  )
}
