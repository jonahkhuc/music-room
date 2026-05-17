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
        {/* Service worker tạm tắt — chưa muốn cache app shell.
            Inline trong <head> để chạy TRƯỚC hydration: gỡ SW cũ + xoá
            cache ngay, tránh stale shell làm React không bind được event. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                  regs.forEach(function (r) { r.unregister(); });
                });
                if (window.caches && caches.keys) {
                  caches.keys().then(function (keys) {
                    keys.forEach(function (k) { caches.delete(k); });
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
