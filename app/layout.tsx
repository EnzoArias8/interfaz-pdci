import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Interfaz - PdCI',
  description: 'Industrial SCADA dashboard for Sparkplug B telemetry and device control.',
  generator: 'v0.app',
  icons: {
    icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220%200%2032%2032%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23070b11%22/%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%227%22 fill=%22%2334d399%22/%3E%3C/svg%3E',
    apple:
      'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220%200%2032%2032%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23070b11%22/%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%227%22 fill=%22%2334d399%22/%3E%3C/svg%3E',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="dark">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
