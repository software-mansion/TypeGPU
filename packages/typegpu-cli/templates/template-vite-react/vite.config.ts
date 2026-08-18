import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [react(), typegpu({})],
});
