import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { Agent } from 'package-manager-detector';
import { loadFile, writeFile } from 'magicast';
import { addVitePlugin } from 'magicast/helpers';

import { findConfig } from '../utils/config.ts';
import { hasDependency } from '../utils/pkg.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep, failAndExit } from '../utils/prompts.ts';
import type { PackageJson } from '../utils/types.ts';

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
];

const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite';
import typegpuPlugin from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpuPlugin()],
});
`;

async function setupViteConfig(filePath: string) {
  let config;
  try {
    config = await loadFile(filePath);
  } catch {
    failAndExit(`Could not parse ${path.basename(filePath)}.`);
  }

  addVitePlugin(config, { from: 'unplugin-typegpu/vite', constructor: 'typegpuPlugin' });
  await writeFile(config, filePath);
  p.log.success(`Updated ${path.basename(filePath)}.`);
}

function createViteConfig(cwd: string) {
  fs.writeFileSync(path.join(cwd, 'vite.config.ts'), VITE_CONFIG_TEMPLATE);
  p.log.success('Created vite.config.ts.');
}

export async function askForVite(cwd: string, pm: Agent, pkg: PackageJson) {
  if (hasDependency(pkg, 'unplugin-typegpu')) {
    p.log.info('unplugin-typegpu is already installed.');
    return;
  }

  if (!(await confirmStep('Install unplugin-typegpu and configure vite?'))) {
    return;
  }

  pmAdd(pm, ['unplugin-typegpu'], true);

  const viteConfigPath = findConfig(cwd, VITE_CONFIG_NAMES);
  if (viteConfigPath) {
    await setupViteConfig(viteConfigPath);
  } else if (await confirmStep('No vite config found. Create vite.config.ts?')) {
    createViteConfig(cwd);
  }
}
