import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

/**
 * Env:
 * - EXAMPLE: path of the example relative to ./examples (e.g. rendering/jelly-slider)
 * - STRIP=1: `unstable_stripJsImpl` in the plugin
 * - OBFUSCATE=1: `unstable_obfuscate` in the plugin (requires auto-naming off)
 * - NONAME=1: only disable auto-naming (to isolate its effect from obfuscation)
 * - MINIFY=1: `unstable_minify` passed to every `tgpu.init`
 */
const example = process.env.EXAMPLE ?? 'rendering/jelly-slider';
const strip = process.env.STRIP === '1';
const obfuscate = process.env.OBFUSCATE === '1';
const noName = obfuscate || process.env.NONAME === '1';
const minify = process.env.MINIFY === '1';
const outDir = process.env.OUT_DIR ?? `dist/${example}`;

function variantTweaks(): Plugin {
  return {
    name: 'bundle-size-lab:variant-tweaks',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('node_modules') || !/\.[jt]sx?$/.test(id)) {
        return;
      }
      let out = code;
      if (minify) {
        out = out
          .replace(/tgpu\.init\(\)/g, 'tgpu.init({ unstable_minify: true })')
          .replace(/tgpu\.init\(\{(?! unstable_minify)/g, 'tgpu.init({ unstable_minify: true,');
      }
      return out === code ? undefined : out;
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(`./examples/${example}`, import.meta.url)),
  base: './',
  plugins: [
    variantTweaks(),
    typegpu({
      autoNamingEnabled: !noName,
      unstable_obfuscate: obfuscate,
      unstable_stripJsImpl: strip,
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL(outDir, import.meta.url)),
    emptyOutDir: true,
    target: 'esnext',
    reportCompressedSize: false,
    sourcemap: process.env.SOURCEMAP === '1' ? 'hidden' : false,
    // A single JS chunk makes comparisons simpler
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
