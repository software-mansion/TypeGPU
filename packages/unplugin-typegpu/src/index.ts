import { createUnplugin } from 'unplugin';
import { rollUpImpl } from './rollup-impl.ts';

const typegpu = createUnplugin(rollUpImpl);

export type { Options } from './common.ts';

export default typegpu;

export const vitePlugin = typegpu.vite;
export const rollupPlugin = typegpu.rollup;
export const rolldownPlugin = typegpu.rolldown;
export const webpackPlugin = typegpu.webpack;
export const rspackPlugin = typegpu.rspack;
export const esbuildPlugin = typegpu.esbuild;
export const farmPlugin = typegpu.farm;

export { default as babelPlugin } from './babel.ts';
export { default as bunPlugin } from './bun.ts';
export { default as rolldownBrowserPlugin } from './rolldown-browser.ts';
