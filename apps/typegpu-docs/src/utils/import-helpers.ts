/**
 * Extracts the imported URL as-in
 */
export function extractUrlFromViteImport(
  importFn: () => void,
): string | undefined {
  const match = String(importFn).match(/import\(["']([^"']+)["']\)/);

  if (match?.[1]) {
    return match[1];
  }

  return undefined;
}

export function noCacheImport<T>(
  importFn: () => Promise<T>,
  baseUrl?: string,
): Promise<T> {
  const href = extractUrlFromViteImport(importFn);

  if (!href) {
    throw new Error(`Could not no-cache-import using ${importFn}`);
  }

  const url = new URL(href, baseUrl);
  url.searchParams.append('update', Date.now().toString());
  return import(/* @vite-ignore */ url.href);
}
