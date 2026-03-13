/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
