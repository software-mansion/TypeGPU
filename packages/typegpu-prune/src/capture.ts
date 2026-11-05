/**
 * Build-time capture of TypeGPU code as an `Artifact`, for hosts other than the pruned JS
 * runtime. Runs in Node, and has to share the `typegpu` instance of the code it captures.
 */

export { capture, PrecompileError } from './compiler/capture.ts';
export type { CaptureOptions, CaptureResult } from './compiler/capture.ts';
export { emit } from './compiler/emit.ts';
export type { EmitOptions } from './compiler/emit.ts';
export { ARTIFACT_VERSION } from './artifact.ts';
export type * from './artifact.ts';
