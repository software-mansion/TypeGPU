import babelPlugin from './babel';
import rollupPlugin from './rollup';

export type { TypegpuPluginOptions } from './common';

export default {
  babel: babelPlugin,
  rollup: rollupPlugin,
};
