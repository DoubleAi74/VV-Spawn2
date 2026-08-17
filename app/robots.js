import { siteOrigin } from '@/lib/metadata';

// `/admin` is closed to everyone but the configured owner (SEC-5) and `/login`
// has nothing to index; listing them here is about not wasting a crawl budget,
// not about access control, which is enforced in the routes themselves.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/login'],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
