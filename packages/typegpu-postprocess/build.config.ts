import { defineBuildConfig } from 'unbuild';
import typegpu from 'unplugin-typegpu/rollup';

export default defineBuildConfig({
  hooks: {
    'rollup:options': (_options, config) => {
      config.plugins.push(typegpu({ include: [/\.ts$/] }));
    },
  },
});
