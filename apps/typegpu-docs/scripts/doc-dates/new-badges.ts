/**
 * Derives "new" sidebar badges from the `lastUpdated` frontmatter of docs pages.
 * A page is considered new if it was created or updated within a month of when the docs are built.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDate, readLastUpdated } from './frontmatter.ts';

/** The earliest `lastUpdated` date (`YYYY-MM-DD`) that still counts as new, one month before `now`. */
export function newSince(now = new Date()): string {
  const since = new Date(now);
  since.setMonth(since.getMonth() - 1);
  return formatDate(since);
}

function findPage(contentDir: string, slug: string): string | undefined {
  return [`${slug}.mdx`, `${slug}.md`, `${slug}/index.mdx`, `${slug}/index.md`]
    .map((candidate) => join(contentDir, candidate))
    .find((path) => existsSync(path));
}

interface SidebarItemLike {
  slug?: string;
  badge?: unknown;
  items?: SidebarItemLike[];
}

/**
 * Adds a "new" badge to every sidebar item (that has no badge yet) whose page was updated
 * on the `since` date (`YYYY-MM-DD`), or later.
 */
export function withNewBadges<T extends SidebarItemLike>(
  items: T[],
  { contentDir, since = newSince() }: { contentDir: string; since?: string },
): T[] {
  return items.map((item) => {
    if (item.items) {
      return { ...item, items: withNewBadges(item.items, { contentDir, since }) };
    }
    if (item.slug === undefined || item.badge !== undefined) {
      return item;
    }

    const page = findPage(contentDir, item.slug);
    const lastUpdated = page ? readLastUpdated(readFileSync(page, 'utf8')) : undefined;
    if (lastUpdated?.kind === 'valid' && lastUpdated.date >= since) {
      return { ...item, badge: { text: 'new' } };
    }
    return item;
  });
}
