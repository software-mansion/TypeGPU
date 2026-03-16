import { createUnplugin } from 'unplugin';
import { unpluginFactory } from './factory.ts';

const typegpu = /*#__PURE__*/ createUnplugin(unpluginFactory);

export type { Options } from './common.ts';

export default typegpu;

export const vitePlugin = typegpu.vite;
export const rollupPlugin = typegpu.rollup;
export const rolldownPlugin = typegpu.rolldown;
export const webpackPlugin = typegpu.webpack;
export const rspackPlugin = typegpu.rspack;
export const esbuildPlugin = typegpu.esbuild;
export const bunPlugin = typegpu.bun;
export const farmPlugin = typegpu.farm;
export const unloaderPlugin = typegpu.unloader;

export { default as babelPlugin } from './babel.ts';
export { default as rolldownBrowserPlugin } from './rolldown-browser.ts';
