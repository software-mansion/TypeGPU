import { initBuildScript } from '@typegpu/tgpu-dev-cli';
import { defineConfig } from 'tsup';

const { inDevMode, featureSet } = initBuildScript();

const entry = ['src/index.ts', 'src/data/index.ts'];
if (featureSet === 'experimental') {
  entry.push(
    'src/experimental/index.ts',
    'src/macro/index.ts',
    'src/smol/index.ts',
  );
}

export default defineConfig({
  entry,
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: true,
  sourcemap: true,
  minify: !inDevMode,
  // When in dev mode, we first build then watch, so we do not want the `watch` to
  // clean the out directory.
  clean: !inDevMode,
  dts: true,
});
