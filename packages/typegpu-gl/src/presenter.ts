type Canvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * The fallback renders canvas targets into the default framebuffer of its own
 * `OffscreenCanvas`, and copies the result onto the target canvas.
 *
 * `transferToImageBitmap()` hands over the drawing buffer and resets it, so presenting
 * after every draw would wipe earlier passes of the same frame. Instead, presentation
 * is deferred to a microtask, so that every draw recorded in one synchronous block of
 * code (like a `requestAnimationFrame` callback) lands in one image. Drawing into a
 * different canvas presents the pending one first, since they share the drawing buffer.
 *
 * Every root created with the same WebGL context shares one drawing buffer, so they
 * also share one presenter (see {@link CanvasPresenter.for}). Otherwise, one root could
 * overwrite an image that another root has yet to present.
 *
 * NOTE: This is narrower than a frame in WebGPU. Awaiting anything between two passes
 * that draw into the same canvas presents the first pass on its own, and the second one
 * then starts from a cleared drawing buffer.
 */
export class CanvasPresenter {
  static readonly #presenters = new WeakMap<OffscreenCanvas, CanvasPresenter>();

  /**
   * Returns the presenter of the drawing buffer that `gl` renders into.
   */
  static for(gl: WebGL2RenderingContext): CanvasPresenter {
    const offscreen = gl.canvas as OffscreenCanvas;
    let presenter = CanvasPresenter.#presenters.get(offscreen);
    if (!presenter) {
      presenter = new CanvasPresenter(gl);
      CanvasPresenter.#presenters.set(offscreen, presenter);
    }
    return presenter;
  }

  readonly #gl: WebGL2RenderingContext;
  readonly #offscreen: OffscreenCanvas;
  readonly #bitmapContexts = new WeakMap<Canvas, ImageBitmapRenderingContext>();
  #pending: Canvas | null = null;

  private constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#offscreen = gl.canvas as OffscreenCanvas;
  }

  /**
   * Acquires the context used to present onto `canvas`. Called when the canvas gets
   * configured, so that a canvas that can't be presented onto fails right away, rather
   * than in a microtask, where the error couldn't be caught.
   */
  register(canvas: Canvas): void {
    if (this.#bitmapContexts.has(canvas)) {
      return;
    }
    const bitmapCtx = canvas.getContext('bitmaprenderer');
    if (!bitmapCtx) {
      throw new Error(
        "Could not get a 'bitmaprenderer' context of the target canvas. The WebGL fallback presents through it, so the canvas cannot have another type of context.",
      );
    }
    this.#bitmapContexts.set(canvas, bitmapCtx);
  }

  /**
   * Prepares the drawing buffer for drawing into `canvas`.
   */
  beginDraw(canvas: Canvas): void {
    if (this.#pending !== null && this.#pending !== canvas) {
      this.flush();
    }

    // Resizing clears the drawing buffer, so we only do it when the size changes
    const offscreen = this.#offscreen;
    if (offscreen.width !== canvas.width) {
      offscreen.width = canvas.width;
    }
    if (offscreen.height !== canvas.height) {
      offscreen.height = canvas.height;
    }
  }

  /**
   * Schedules presenting the drawing buffer onto `canvas`.
   */
  endDraw(canvas: Canvas): void {
    if (this.#pending === canvas) {
      return;
    }
    this.#pending = canvas;
    queueMicrotask(() => this.flush());
  }

  /**
   * Presents the pending drawing buffer right away, if there is one.
   */
  flush(): void {
    const canvas = this.#pending;
    if (canvas === null) {
      return;
    }
    this.#pending = null;

    // `transferToImageBitmap()` throws on an empty drawing buffer and on a lost context.
    // This usually runs in a microtask, where the error couldn't be caught, so the image
    // gets dropped instead. A lost context has nothing to present anyway, and the canvas
    // keeps its last image until the context gets restored.
    const offscreen = this.#offscreen;
    if (offscreen.width === 0 || offscreen.height === 0 || this.#gl.isContextLost()) {
      return;
    }

    this.register(canvas);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- registered above
    this.#bitmapContexts.get(canvas)!.transferFromImageBitmap(offscreen.transferToImageBitmap());
  }
}
