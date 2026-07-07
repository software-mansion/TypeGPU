import tailwindcss from '@tailwindcss/vite';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [tailwindcss(), typegpu()],
  },
});
