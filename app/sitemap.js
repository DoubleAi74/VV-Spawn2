import { getSitemapEntries } from '@/lib/data';
import { siteOrigin } from '@/lib/metadata';

// Rebuilt hourly rather than on every crawl: the underlying query is two
// collection scans and nothing here changes minute to minute.
export const revalidate = 3600;

export default async function sitemap() {
  const origin = siteOrigin();
  const { users, pages } = await getSitemapEntries();

  return [
    { url: origin, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ...users.map((user) => ({
      url: `${origin}/${user.usernameTag}`,
      lastModified: user.createdAt || new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
    ...pages.map((page) => ({
      url: `${origin}/${page.usernameTag}/${page.slug}`,
      lastModified: page.createdAt || new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    })),
  ];
}
