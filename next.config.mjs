/** @type {import('next').NextConfig} */

// Applied to every response. There is no script-src here yet: the app renders
// user rich text through dangerouslySetInnerHTML in four places and the Quill
// editor relies on inline styles, so a full CSP needs to be checked against
// both before it can be turned on. frame-ancestors is the part that carries no
// such risk.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  poweredByHeader: false,
  experimental: {
    reactCompiler: true,
    // Units are seconds. Defaults are short for dynamic routes, which makes
    // dashboard/page transitions lose their warm cache after idle time.
    staleTimes: {
      dynamic: 3600, // 1 hour
      static: 3600, // 1 hour
    },
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/cloudflareLoader.js',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
