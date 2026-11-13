import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import type { TypegpuSubpathResolver } from './namespaceImports.ts';

const none: ReadonlySet<string> = new Set();
const byDirectory = new Map<string, ReadonlySet<string>>();
const byPackageJson = new Map<string, ReadonlySet<string>>();

/**
 * Reads the export map of the 'typegpu' package that `importer` resolves to.
 * Node-only, so it's kept out of the shared factory (used by the browser build too).
 */
export const getTypegpuSubpaths: TypegpuSubpathResolver = (importer) => {
  const path = importer.replace(/\?.*$/, '');
  if (!isAbsolute(path)) {
    return none;
  }

  const directory = dirname(path);
  let subpaths = byDirectory.get(directory);
  if (subpaths) {
    return subpaths;
  }

  try {
    const packageJsonPath = createRequire(join(directory, 'noop.js')).resolve(
      'typegpu/package.json',
    );
    subpaths = byPackageJson.get(packageJsonPath);
    if (!subpaths) {
      const { exports } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        exports?: unknown;
      };
      subpaths = new Set(exports && typeof exports === 'object' ? Object.keys(exports) : []);
      byPackageJson.set(packageJsonPath, subpaths);
    }
  } catch {
    // TypeGPU isn't resolvable from here, nothing to rewrite to
    subpaths = none;
  }

  byDirectory.set(directory, subpaths);
  return subpaths;
};
