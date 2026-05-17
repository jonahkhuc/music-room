import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';

export const metadata: Metadata = {
  title:       'Music Room',
  description: 'Listen to music together, in sync.',
  manifest:    '/manifest.json',
  icons: {
    icon:  '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable:          true,
    statusBarStyle:   'black-translucent',
    title:            'Music Room',
  },
};

export const viewport: Viewport = {
  width:            'device-width',
  initialScale:     1,
  maximumScale:     1,
  themeColor:       '#0d0d0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased">
        <LanguageProvider>
          {children}
        </LanguageProvider>
        {/* Service worker tạm tắt — chưa muốn cache app shell.
            Vẫn load register-sw.js để unregister SW cũ ở client đã từng cài. */}
        <script src="/register-sw.js" />
      </body>
    </html>
  );
}
