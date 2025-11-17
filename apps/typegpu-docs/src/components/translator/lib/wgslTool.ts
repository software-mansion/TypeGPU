import { compileShader, getSupportedFormats, init } from 'wgsl-wasm-transpiler-bundler';

export function initializeWasm() {
  init();
  return getSupportedFormats();
}

export function compile(wgslCode: string, format: string) {
  return compileShader(wgslCode, format);
}
