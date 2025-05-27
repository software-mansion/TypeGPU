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
