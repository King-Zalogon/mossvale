/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{source: '/game', destination: '/game/', permanent: false}];
  },
  async headers() {
    return [
      {
        source: '/game/:path*',
        headers: [
          {key: 'Cache-Control', value: 'private, no-store, max-age=0'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          {key: 'Referrer-Policy', value: 'no-referrer'},
        ],
      },
    ];
  },
};

export default nextConfig;
