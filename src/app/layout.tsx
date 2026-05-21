import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'LA Signs & Graphics CC — Operations',
  description: 'Internal Operations System — LA Signs & Graphics CC, Windhoek, Namibia',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-text-primary font-body antialiased">
        {children}
        <Toaster
          position="bottom-left"
          toastOptions={{
            style: {
              background: '#1a1a24',
              color: '#f0f0f5',
              border: '1px solid #232333',
              borderRadius: '6px',
              fontSize: '13px',
            },
            success: {
              iconTheme: { primary: '#e8a020', secondary: '#0a0a0f' },
            },
            error: {
              iconTheme: { primary: '#dc2626', secondary: '#0a0a0f' },
            },
          }}
        />
      </body>
    </html>
  )
}
