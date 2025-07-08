import { compileShader, getSupportedFormats, init } from 'wgsl-tool';

/** Normalize any thrown value into a readable string */
export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function initializeWasm() {
  init();
  console.log(getSupportedFormats());
  return getSupportedFormats();
}

export function compile(wgslCode: string, format: string) {
  return compileShader(wgslCode, format);
}
