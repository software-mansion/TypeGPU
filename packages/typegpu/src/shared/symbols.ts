// The version is inlined during build-time 🎉
// It helps us identify problems when two versions of
// TypeGPU are used at the same time.
import { version } from '../../package.json';

export const $internal = Symbol(`typegpu:${version}:$internal`);
/**
 * A value's data type as seen by the WGSL generator
 */
export const $wgslDataType = Symbol(`typegpu:${version}:$wgslDataType`);
/**
 * The getter to the value of this resource, accessible on the GPU
 */
export const $gpuValueOf = Symbol(`typegpu:${version}:$gpuValueOf`);
export const $getNameForward = Symbol(`typegpu:${version}:$getNameForward`);
/**
 * Marks an object with slot-value bindings
 */
export const $providing = Symbol(`typegpu:${version}:$providing`);

//
// Type tokens
//

/**
 * Type token for the inferred (CPU & GPU) representation of a resource
 */
export const $repr = Symbol(`typegpu:${version}:$repr`);
/**
 * Type token for the inferred (GPU-side) representation of a resource
 * If present, it shadows the value of `$repr` for GPU-side inference.
 */
export const $gpuRepr = Symbol(`typegpu:${version}:$gpuRepr`);
/**
 * Type token for the inferred partial representation of a resource.
 * If present, it shadows the value of `$repr`
 */
export const $reprPartial = Symbol(`typegpu:${version}:$reprPartial`);
/**
 * Type token holding schemas that are identical in memory layout.
 */
export const $memIdent = Symbol(`typegpu:${version}:$memIdent`);
