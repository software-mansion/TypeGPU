import ecTwoSlash from 'expressive-code-twoslash';
import ts from 'typescript';

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  plugins: [
    ecTwoSlash({
      twoslashOptions: {
        strict: true,
        compilerOptions: { moduleResolution: ts.ModuleResolutionKind.Bundler },
      },
    }),
  ],
};
