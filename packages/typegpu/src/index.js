/**
 * @module typegpu
 */

// NOTE: This is a barrel file, internal files should not import things from this file

// oxlint-disable-next-line
import * as tgpu from './tgpu.ts';
export * as tgpu from './tgpu.ts';
export default tgpu;

export * from './indexNamedExports.ts';
