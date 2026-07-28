import { defineConfig } from 'tsdown';

// Rolldown rewrites `require` into a helper Metro cannot statically analyze,
// restoring the literal call keeps react-native-worklets an optional dependency
const preserveOptionalRequire = {
  name: 'preserve-optional-require',
  renderChunk(code: string) {
    if (!code.includes('__require("react-native-worklets")')) {
      return null;
    }
    return code
      .replace('__require("react-native-worklets")', 'require("react-native-worklets")')
      .replace(/import \{ __require \} from "[^"]+";\n/, '');
  },
};

export default defineConfig({
  entry: ['src/browser/index.ts', 'src/react-native/index.ts'],
  outDir: 'dist',
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: false,
  target: false,
  plugins: [preserveOptionalRequire],
});
