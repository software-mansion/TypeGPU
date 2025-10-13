import type { Options } from './common.ts';
import { rollUpImpl } from './rollup-impl.ts';

export default (options: Options) => {
  // The unplugin API is based on the rollup/rolldown APIs, so it
  // should just be a compatible rolldown plugin.
  return rollUpImpl(options);
};
