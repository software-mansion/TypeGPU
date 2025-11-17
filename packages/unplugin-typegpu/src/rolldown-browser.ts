import type { Options } from './core/common.ts';
import { unpluginFactory } from './core/factory.ts';

// We're not using the unplugin APIs to create the plugin, as it strictly depends
// on Node-only APIs. The unplugin factory is based on the rollup/rolldown APIs, so
// it should just be a compatible rolldown plugin.
export default (options?: Options) => unpluginFactory(options ?? {}, { framework: 'rolldown' });
