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
  /** Unregisters the callback that releases the buffer with its owner texture */
  readonly unsubscribe: () => void;
}

interface CachedFramebuffer {
  readonly framebuffer: WebGLFramebuffer;
  /** Unregisters the release callback from every attached texture */
  readonly unsubscribe: readonly (() => void)[];
}

/**
 * Creates and caches framebuffers for every combination of attachments pipelines draw
 * into, so that attaching a depth buffer for one pass doesn't affect other passes that
 * render into the same color target.
 */
export class RenderTargets {
  readonly #gl: WebGL2RenderingContext;
  readonly #framebuffers = new Map<string, CachedFramebuffer>();
  readonly #implicitDepth = new Map<WebGLTextureRenderView, ImplicitDepthBuffer>();

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
  }

  /**
   * @param colors Color attachments, indexed by draw buffer (`null` for gaps).
   */
  framebufferFor(
    colors: readonly (WebGLTextureRenderView | null)[],
    depth: DepthTarget | undefined,
  ): WebGLFramebuffer {
    const [firstColor] = colors;
    if (colors.length === 1 && firstColor?.framebuffer && depth === undefined) {
      return firstColor.framebuffer;
    }

    const implicitDepth = depth === 'implicit' ? this.#implicitDepthFor(colors) : undefined;
    const depthKey =
      depth === undefined ? '-' : depth === 'implicit' ? `i${implicitDepth?.id}` : depth.id;
    const key = `${colors.map((view) => view?.id ?? 'x').join(',')}|${depthKey}`;

    const cached = this.#framebuffers.get(key);
    if (cached) {
      return cached.framebuffer;
    }

    const explicitViews = [
      ...colors.filter((view) => view !== null),
      ...(depth !== undefined && depth !== 'implicit' ? [depth] : []),
    ];
    const describeViews = () =>
      explicitViews
        .map((view) => `'${view.texture.props.format}' ${view.size.join('x')}`)
        .join(', ');
    // WebGL 2 accepts attachments of different sizes and renders into their intersection,
    // WebGPU rejects the pass instead
    const [firstView] = explicitViews;
    if (
      firstView &&
      explicitViews.some(
        (view) => view.size[0] !== firstView.size[0] || view.size[1] !== firstView.size[1],
      )
    ) {
      throw new Error(
        `The attachments of a render pass must all have the same size, got ${describeViews()}.`,
      );
    }

    const gl = this.#gl;
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('Failed to create WebGL framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    colors.forEach((view, i) => {
      if (view) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0 + i,
          gl.TEXTURE_2D,
          view.texture.raw,
          view.descriptor.baseMipLevel ?? 0,
        );
      }
    });
    // Part of the framebuffer's state, so it only needs setting once
    gl.drawBuffers(
      colors.length === 0
        ? [gl.NONE]
        : colors.map((view, i) => (view ? gl.COLOR_ATTACHMENT0 + i : gl.NONE)),
    );

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
      throw new Error(
        `The attachments (${describeViews()}) cannot be rendered into together by this WebGL 2 implementation.`,
      );
    }

    const attachedTextures = new Set(explicitViews.map((view) => view.texture));
    // Destroying any of the attachments releases the framebuffer. The callback is then
    // removed from the others too, so that long-lived textures (e.g. a color target paired
    // with depth textures recreated on resize) don't keep collecting stale callbacks.
    const release = () => {
      const entry = this.#framebuffers.get(key);
      if (entry?.framebuffer === framebuffer) {
        this.#framebuffers.delete(key);
        for (const unsubscribe of entry.unsubscribe) unsubscribe();
        gl.deleteFramebuffer(framebuffer);
      }
    };
    this.#framebuffers.set(key, {
      framebuffer,
      unsubscribe: [...attachedTextures].map((texture) => texture.onDestroy(release)),
    });

    return framebuffer;
  }

  #implicitDepthFor(colors: readonly (WebGLTextureRenderView | null)[]): ImplicitDepthBuffer {
    const owner = colors.find((view) => view !== null);
    if (!owner) {
      throw new Error(
        'Rendering without color attachments requires a depth texture created by the WebGL root.',
      );
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

    const unsubscribe =
      existing?.unsubscribe ??
      owner.texture.onDestroy(() => {
        const current = this.#implicitDepth.get(owner);
        if (current) {
          this.#implicitDepth.delete(owner);
          gl.deleteRenderbuffer(current.renderbuffer);
        }
      });
    const depthBuffer = { id: nextImplicitDepthId++, renderbuffer, width, height, unsubscribe };
    this.#implicitDepth.set(owner, depthBuffer);
    return depthBuffer;
  }

  destroy(): void {
    const gl = this.#gl;
    for (const { framebuffer, unsubscribe } of this.#framebuffers.values()) {
      for (const fn of unsubscribe) fn();
      gl.deleteFramebuffer(framebuffer);
    }
    this.#framebuffers.clear();
    for (const { renderbuffer, unsubscribe } of this.#implicitDepth.values()) {
      unsubscribe();
      gl.deleteRenderbuffer(renderbuffer);
    }
    this.#implicitDepth.clear();
  }
}
