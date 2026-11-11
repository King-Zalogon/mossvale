// Security headers (#443). The game under /game is static and same-origin and uses no inline script, eval or workers.
// Its only third-party dependency is Google Fonts (stylesheet from fonts.googleapis.com, files from fonts.gstatic.com),
// allowed by exact host; self-hosting those fonts would let both be removed. Inline style *attributes* (set through innerHTML by the menus) are allowed
// via style-src-attr only; style elements and external styles stay same-origin.
export const GAME_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const everywhere = [
  {key: 'X-Content-Type-Options', value: 'nosniff'},
  {key: 'X-Frame-Options', value: 'DENY'},
  {key: 'Content-Security-Policy', value: "frame-ancestors 'none'"},
  {key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains'},
  {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'},
  {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {source: '/:path*', headers: everywhere},
      {
        // Later rules override earlier ones for the same key, so the game keeps its stricter policy.
        source: '/game/:path*',
        headers: [
          {key: 'Cache-Control', value: 'private, no-store, max-age=0'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          {key: 'Referrer-Policy', value: 'no-referrer'},
          {key: 'Content-Security-Policy', value: GAME_CSP},
        ],
      },
    ];
  },
};

export default nextConfig;
