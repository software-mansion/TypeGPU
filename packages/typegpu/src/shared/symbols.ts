// The version is inlined during build-time 🎉
// It helps us identify problems when two versions of
// TypeGPU are used at the same time.
import { version } from '../../package.json';

export const $internal = Symbol(`typegpu:${version}:$internal`);
/**
 * The getter to the value of this resource, accessible on the GPU
 */
export const $gpuValueOf = Symbol(`typegpu:${version}:$gpuValueOf`);
/**
 * If this symbol is present, this means that getName and setName
 * will refer to object behind this property instead.
 */
export const $getNameForward = Symbol(`typegpu:${version}:$getNameForward`);
/**
 * Marks an object with slot-value bindings
 */
export const $providing = Symbol(`typegpu:${version}:$providing`);

/**
 * Objects can provide the snippet that represents them.
 */
export const $ownSnippet = Symbol(`typegpu:${version}:$ownSnippet`);

export const $resolve = Symbol(`typegpu:${version}:$resolve`);

/**
 * A way for a schema to provide casting behavior, without the need to be explicitly
 * callable by the end-user (e.g. vertex formats)
 */
export const $cast = Symbol(`typegpu:${version}:$cast`);
/**
 * Can be called on the GPU
 */
export const $gpuCallable = Symbol(`typegpu:${version}:$gpuCallable`);

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
 * If present, it shadows the value of `$repr` for use in partial IO.
 */
export const $reprPartial = Symbol(`typegpu:${version}:$reprPartial`);
/**
 * Type token holding schemas that are identical in memory layout.
 */
export const $memIdent = Symbol(`typegpu:${version}:$memIdent`);

/**
 * Type token, signaling that a schema can be used in a storage buffer.
 */
export const $validStorageSchema = Symbol(
  `typegpu:${version}:$invalidStorageSchema`,
);
/**
 * Type token, signaling that a schema can be used in a uniform buffer.
 */
export const $validUniformSchema = Symbol(
  `typegpu:${version}:$validUniformSchema`,
);
/**
 * Type token, signaling that a schema can be used in a vertex buffer.
 */
export const $validVertexSchema = Symbol(
  `typegpu:${version}:$validVertexSchema`,
);
/**
 * Type token, containing a reason for why the schema is invalid (if it is).
 */
export const $invalidSchemaReason = Symbol(
  `typegpu:${version}:$invalidSchemaReason`,
);

export function isMarkedInternal(
  value: unknown,
): value is { [$internal]: Record<string, unknown> | true } {
  return !!(value as { [$internal]: Record<string, unknown> })?.[$internal];
}
