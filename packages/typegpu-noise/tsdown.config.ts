import { defineConfig } from 'tsdown';
import typegpu from 'unplugin-typegpu/rolldown';

export default defineConfig({
  entry: 'src/index.ts',
  plugins: [
    typegpu({}),
  ],
});
