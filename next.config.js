/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// Dev mode cần 'unsafe-eval' cho webpack eval-source-map + React Refresh HMR.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  'https://www.youtube.com',
  'https://s.ytimg.com',
].join(' ');

const nextConfig = {
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
              "img-src 'self' data: https://i.ytimg.com https://img.youtube.com",
              "connect-src 'self' wss: ws: https:",
              "media-src 'self' https://www.youtube.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
