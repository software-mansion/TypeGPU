/**
 * Helpers for reading and writing the `lastUpdated` frontmatter field of docs pages.
 * Starlight natively supports this field, and displays it in the page footer.
 *
 * Only uses Node built-ins, so it can be run directly with `node` (no install needed).
 */

const FRONTMATTER_RE = /^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LAST_UPDATED_LINE_RE = /^lastUpdated:[ \t]*(.*?)[ \t]*$/m;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LastUpdated =
  | { kind: 'missing' }
  | { kind: 'invalid'; raw: string }
  /** A valid date, but quoted, which YAML parses as a string instead of a date. */
  | { kind: 'quoted'; date: string }
  | { kind: 'valid'; date: string };

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Reads the `lastUpdated` field (as a `YYYY-MM-DD` string) from the frontmatter of an .md/.mdx file.
 */
export function readLastUpdated(source: string): LastUpdated {
  const frontmatter = FRONTMATTER_RE.exec(source)?.[2];
  const match = frontmatter !== undefined ? LAST_UPDATED_LINE_RE.exec(frontmatter) : null;
  if (!match) {
    return { kind: 'missing' };
  }
  const raw = (match[1] ?? '').replace(/[ \t]+#.*$/, '');
  if (isValidDate(raw)) {
    return { kind: 'valid', date: raw };
  }
  const unquoted = raw.replace(/^(['"])(.*)\1$/, '$2');
  if (unquoted !== raw && isValidDate(unquoted)) {
    return { kind: 'quoted', date: unquoted };
  }
  return { kind: 'invalid', raw };
}

/**
 * Returns `source` with the `lastUpdated` frontmatter field set to `date`.
 * Throws if the file has no frontmatter.
 */
export function writeLastUpdated(source: string, date: string): string {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    throw new Error('expected the file to start with a frontmatter block');
  }
  const [whole, eol = '\n', frontmatter = ''] = match;
  const line = `lastUpdated: ${date}`;
  const updated = LAST_UPDATED_LINE_RE.test(frontmatter)
    ? frontmatter.replace(LAST_UPDATED_LINE_RE, () => line)
    : `${frontmatter}${eol}${line}`;
  const start = `---${eol}`.length;
  return `${whole.slice(0, start)}${updated}${whole.slice(start + frontmatter.length)}${source.slice(whole.length)}`;
}

/**
 * Whether the given path (relative to the docs content directory) is a page that should track
 * its last updated date. Blog posts are excluded, as they carry their own publication `date`.
 */
export function isTrackedDocPage(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  return (
    /\.mdx?$/.test(normalized) && !normalized.startsWith('blog/') && !normalized.startsWith('api/')
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a date in the local timezone as `YYYY-MM-DD`. */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's date in the local timezone, as `YYYY-MM-DD`. */
export function today(): string {
  return formatDate(new Date());
}

/** Shifts a `YYYY-MM-DD` date by the given number of days. */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
