export class WebGLFallbackUnsupportedError extends Error {
  /**
   * @param operation What the user tried to do, e.g. `'createMutable'`.
   * @param reason Optional explanation of why WebGL 2 can't do it, or what to do instead.
   */
  constructor(operation: string, reason?: string) {
    super(
      `WebGL fallback does not support '${operation}'${reason ? ` (${reason})` : ''}. Use WebGPU for full TypeGPU functionality.`,
    );
    this.name = 'WebGLFallbackUnsupportedError';
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, WebGLFallbackUnsupportedError.prototype);
  }
}
