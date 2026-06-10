import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import typegpu from 'unplugin-typegpu/vite';

import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [tailwindcss(), react(), typegpu()],
  },
});
