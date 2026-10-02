import type { WebGLTextureRenderView } from './webglTexture.ts';

/**
 * The depth-stencil attachment of a texture render target:
 * - a render view of a depth texture created by the root, which is attached as is, or
 * - `'implicit'`, when anything else is passed as the view (e.g. a placeholder in code
 *   that only creates depth textures for WebGPU). The color target then gets its own
 *   depth-stencil renderbuffer, shared by every pass that renders into it.
 */
export type DepthTarget = WebGLTextureRenderView | 'implicit';

let nextImplicitDepthId = 0;

interface ImplicitDepthBuffer {
  /** Identifies the buffer in framebuffer cache keys */
  readonly id: number;
  readonly renderbuffer: WebGLRenderbuffer;
  readonly width: number;
  readonly height: number;
}

/**
 * Creates and caches framebuffers for every combination of attachments pipelines draw
 * into, so that attaching a depth buffer for one pass doesn't affect other passes that
 * render into the same color target.
 */
export class RenderTargets {
  readonly #gl: WebGL2RenderingContext;
  readonly #framebuffers = new Map<string, WebGLFramebuffer>();
  readonly #implicitDepth = new Map<WebGLTextureRenderView, ImplicitDepthBuffer>();

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
  }

  framebufferFor(
    colors: readonly WebGLTextureRenderView[],
    depth: DepthTarget | undefined,
  ): WebGLFramebuffer {
    const [firstColor] = colors;
    if (colors.length === 1 && firstColor?.framebuffer && depth === undefined) {
      return firstColor.framebuffer;
    }

    const implicitDepth = depth === 'implicit' ? this.#implicitDepthFor(colors) : undefined;
    const depthKey =
      depth === undefined ? '-' : depth === 'implicit' ? `i${implicitDepth?.id}` : depth.id;
    const key = `${colors.map((view) => view.id).join(',')}|${depthKey}`;

    const cached = this.#framebuffers.get(key);
    if (cached) {
      return cached;
    }

    const gl = this.#gl;
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('Failed to create WebGL framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    colors.forEach((view, i) => {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + i,
        gl.TEXTURE_2D,
        view.texture.raw,
        view.descriptor.baseMipLevel ?? 0,
      );
    });
    // Part of the framebuffer's state, so it only needs setting once
    gl.drawBuffers(colors.map((_, i) => gl.COLOR_ATTACHMENT0 + i));

    if (implicitDepth) {
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER,
        implicitDepth.renderbuffer,
      );
    } else if (depth !== undefined && depth !== 'implicit') {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        depth.texture.format.aspect === 'depth-stencil'
          ? gl.DEPTH_STENCIL_ATTACHMENT
          : gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        depth.texture.raw,
        depth.descriptor.baseMipLevel ?? 0,
      );
    }

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      const sizes = [...colors, ...(depth && depth !== 'implicit' ? [depth] : [])]
        .map((view) => `'${view.texture.props.format}' ${view.size.join('x')}`)
        .join(', ');
      throw new Error(
        `The attachments (${sizes}) cannot be rendered into together by this WebGL 2 implementation. Make sure they all have the same size.`,
      );
    }

    this.#framebuffers.set(key, framebuffer);
    const release = () => {
      if (this.#framebuffers.get(key) === framebuffer) {
        this.#framebuffers.delete(key);
        gl.deleteFramebuffer(framebuffer);
      }
    };
    for (const view of colors) {
      view.texture.onDestroy(release);
    }
    if (depth !== undefined && depth !== 'implicit') {
      depth.texture.onDestroy(release);
    }

    return framebuffer;
  }

  #implicitDepthFor(colors: readonly WebGLTextureRenderView[]): ImplicitDepthBuffer {
    const owner = colors[0];
    if (!owner) {
      throw new Error('Cannot create a depth buffer for a render pass without color targets.');
    }
    const [width, height] = owner.size;

    const existing = this.#implicitDepth.get(owner);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }

    const gl = this.#gl;
    if (existing) {
      // Textures can't be resized, but let's not rely on that
      gl.deleteRenderbuffer(existing.renderbuffer);
    }

    const renderbuffer = gl.createRenderbuffer();
    if (!renderbuffer) throw new Error('Failed to create WebGL renderbuffer');
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    // Depth-stencil, so that both depth and stencil state work with it
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    const depthBuffer = { id: nextImplicitDepthId++, renderbuffer, width, height };
    this.#implicitDepth.set(owner, depthBuffer);
    if (!existing) {
      owner.texture.onDestroy(() => {
        const current = this.#implicitDepth.get(owner);
        if (current) {
          this.#implicitDepth.delete(owner);
          gl.deleteRenderbuffer(current.renderbuffer);
        }
      });
    }
    return depthBuffer;
  }

  destroy(): void {
    const gl = this.#gl;
    for (const framebuffer of this.#framebuffers.values()) {
      gl.deleteFramebuffer(framebuffer);
    }
    this.#framebuffers.clear();
    for (const { renderbuffer } of this.#implicitDepth.values()) {
      gl.deleteRenderbuffer(renderbuffer);
    }
    this.#implicitDepth.clear();
  }
}
