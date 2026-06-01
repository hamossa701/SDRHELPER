import type { Metadata } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SDRHelper - Supervision Prise de RDV B2B',
  description: 'Plateforme de supervision IA pour centres d\'appels B2B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} ${jetBrainsMono.variable}`}>
      <head>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
