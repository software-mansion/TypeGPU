import { languages } from 'monaco-editor';

export const tsCompilerOptions: languages.typescript.CompilerOptions = {
  target: languages.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true,
  strict: true,
  esModuleInterop: true,
  module: languages.typescript.ModuleKind.ESNext,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: true,
  exactOptionalPropertyTypes: true,
  baseUrl: '.',
  lib: ['dom', 'es2021'],
};
