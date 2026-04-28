// The babel plugin can be imported in a browser, which doesn't have `process` defined
if (typeof globalThis.process === 'undefined') {
  // oxlint-disable-next-line typescript/no-explicit-any
  (globalThis.process as any) = {};
}
if (typeof globalThis.process.env === 'undefined') {
  globalThis.process.env = {};
}
