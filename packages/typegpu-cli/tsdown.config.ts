import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsdown';

/**
 * Versions of all public packages in the monorepo, baked into the CLI at build time.
 * They act as the minimum required versions of our packages in scaffolded projects,
 * so that templates can rely on APIs released alongside the CLI.
 */
function getWorkspacePackageVersions(): Record<string, string> {
  const packagesDir = path.resolve(import.meta.dirname, '..');
  const versions: Record<string, string> = {};

  for (const entry of fs.readdirSync(packagesDir)) {
    const pkgPath = path.join(packagesDir, entry, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      continue;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!pkg.private) {
      versions[pkg.name] = pkg.version;
    }
  }

  return versions;
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'esnext',
  dts: false,
  clean: true,
  define: {
    __WORKSPACE_PACKAGE_VERSIONS__: JSON.stringify(getWorkspacePackageVersions()),
  },
});
