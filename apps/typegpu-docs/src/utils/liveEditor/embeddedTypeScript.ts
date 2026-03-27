// @ts-nocheck -- language.typescript is deprecated, but its replacement is not yet exported
import { languages } from 'tsover-monaco-editor';

export const tsnotoverCompilerOptions: languages.typescript.CompilerOptions = {
  target: languages.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true,
  strict: true,
  esModuleInterop: true,
  module: languages.typescript.ModuleKind.ESNext,
  noEmit: true,
  skipLibCheck: true,
  exactOptionalPropertyTypes: true,
  baseUrl: '.',
  lib: ['dom', 'es2021'],
};

export const tsoverCompilerOptions: languages.typescript.CompilerOptions = {
  ...tsnotoverCompilerOptions,
  lib: [...tsnotoverCompilerOptions.lib, 'tsover'],
};
