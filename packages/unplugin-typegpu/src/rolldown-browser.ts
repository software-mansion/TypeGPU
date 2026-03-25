import type { Options } from './common.ts';
import { unpluginFactory } from './factory.ts';

// The unplugin API is based on the rollup/rolldown APIs, so it
// should just be a compatible rolldown plugin.
export default (options?: Options) => unpluginFactory(options ?? {}, { framework: 'rolldown' });
