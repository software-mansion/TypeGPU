/**
 * Attributes of the contexts created by the fallback. Canvas targets render into the
 * context's default framebuffer, which can't have depth or stencil buffers attached
 * later, so both are requested up front (depth is on by default, stencil isn't).
 */
export const GL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  depth: true,
  stencil: true,
};
