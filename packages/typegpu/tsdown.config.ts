import { defineConfig } from 'tsdown';

// TODO: Consider stripping `invariant()` calls of their messages for a smaller bundle size.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/data/index.ts',
    'src/std/index.ts',
  ],
  platform: 'neutral',
  attw: true,
  exports: true,
});
