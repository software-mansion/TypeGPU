export function extractUrlFromViteImport(
  importFn: () => void,
): URL | undefined {
  const match = String(importFn).match(/import\(["']([^"']+)["']\)/);

  if (match?.[1]) {
    return new URL(match[1], import.meta.url);
  }

  return undefined;
}

export function noCacheImport<T>(
  importFn: () => Promise<T>,
): Promise<T> {
  const url = extractUrlFromViteImport(importFn);

  if (!url) {
    throw new Error(`Could not no-cache-import using ${importFn}`);
  }

  url.searchParams.append('update', Date.now().toString());
  return import(/* @vite-ignore */ url.href);
}
