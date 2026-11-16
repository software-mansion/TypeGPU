import { defineConfig } from 'tsdown';

export default defineConfig({
  // Flat, so that the build-time evaluator finds the serializer next to it
  entry: {
    index: 'src/index.ts',
    runtime: 'src/runtime/index.ts',
    capture: 'src/capture.ts',
    serialize: 'src/compiler/serialize.ts',
    vite: 'src/plugin/vite.ts',
    rollup: 'src/plugin/rollup.ts',
    rolldown: 'src/plugin/rolldown.ts',
    esbuild: 'src/plugin/esbuild.ts',
    webpack: 'src/plugin/webpack.ts',
  },
  outDir: 'dist',
  format: 'esm',
  tsconfig: './tsconfig.json',
  target: 'es2022',
  platform: 'node',
  sourcemap: false,
  dts: true,
});
