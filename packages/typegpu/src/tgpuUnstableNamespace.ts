// NOTE: This is a barrel file, internal files should not import things from this file

// Re-exported under the '~unstable' string name by `tgpu.ts`. Babel's CommonJS transform
// (used by React Native's Metro) emits invalid code for `export * as '~unstable' from ...`
// (`exports.~unstable = ...`), but handles named re-exports with string names correctly.
export * as unstable from './tgpuUnstable.ts';
