import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SDRHelper — Supervision Prise de RDV B2B',
  description: 'Plateforme de supervision IA pour centres d\'appels B2B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .mat {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 20px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            direction: ltr;
            -webkit-font-smoothing: antialiased;
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
            user-select: none;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
