import { WebGLFallbackUnsupportedError } from './errors.ts';

type Canvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * The fallback renders canvas targets into the default framebuffer of its context's
 * canvas. When that's the target canvas itself, the browser presents it as it does
 * for any WebGL canvas. Otherwise, the context belongs to an `OffscreenCanvas`, and the
 * result is copied onto the target canvas.
 *
 * `transferToImageBitmap()` hands over the drawing buffer and resets it, so presenting
 * after every draw would wipe earlier passes of the same frame. Instead, presentation
 * is deferred to a microtask, so that every draw recorded in one synchronous block of
 * code (like a `requestAnimationFrame` callback) lands in one image. Drawing into a
 * different canvas presents the pending one first, since they share the drawing buffer.
 *
 * NOTE: This is narrower than a frame in WebGPU. Awaiting anything between two passes
 * that draw into the same canvas presents the first pass on its own, and the second one
 * then starts from a cleared drawing buffer.
 */
export class CanvasPresenter {
  /** The canvas of the WebGL context */
  readonly #glCanvas: Canvas;
  readonly #bitmapContexts = new WeakMap<Canvas, ImageBitmapRenderingContext>();
  #pending: Canvas | null = null;

  constructor(glCanvas: Canvas) {
    this.#glCanvas = glCanvas;
  }

  /**
   * Acquires the context used to present onto `canvas`. Called when the canvas gets
   * configured, so that a canvas that can't be presented onto fails right away, rather
   * than in a microtask, where the error couldn't be caught.
   */
  register(canvas: Canvas): void {
    if (canvas === this.#glCanvas) {
      this.#assertNotMixingCanvases(true);
      return;
    }
    if (this.#bitmapContexts.has(canvas)) {
      return;
    }
    this.#assertNotMixingCanvases(false);
    const bitmapCtx = canvas.getContext('bitmaprenderer');
    if (!bitmapCtx) {
      throw new Error(
        "Could not get a 'bitmaprenderer' context of the target canvas. The WebGL fallback presents through it, so the canvas cannot have another type of context.",
      );
    }
    this.#bitmapContexts.set(canvas, bitmapCtx);
  }

  #usesGlCanvas = false;
  #usesOtherCanvases = false;

  /**
   * Presenting onto another canvas takes away the drawing buffer of the context's own
   * canvas (and resizing it for another canvas clears it), so a root can only do one.
   */
  #assertNotMixingCanvases(glCanvas: boolean): void {
    if (glCanvas) {
      this.#usesGlCanvas = true;
    } else {
      this.#usesOtherCanvases = true;
    }
    if (this.#usesGlCanvas && this.#usesOtherCanvases) {
      throw new WebGLFallbackUnsupportedError(
        'rendering into both the canvas of the WebGL context and other canvases',
        "presenting onto other canvases takes the context canvas' drawing buffer away",
      );
    }
  }

  /**
   * Prepares the drawing buffer for drawing into `canvas`.
   */
  beginDraw(canvas: Canvas): void {
    if (this.#pending !== null && this.#pending !== canvas) {
      this.flush();
    }
    if (canvas === this.#glCanvas) {
      // Drawing into the context's own canvas, which the app sizes
      return;
    }

    // Resizing clears the drawing buffer, so we only do it when the size changes
    const offscreen = this.#glCanvas;
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
    if (this.#pending === canvas || canvas === this.#glCanvas) {
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

    this.register(canvas);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- registered above
    this.#bitmapContexts
      .get(canvas)!
      .transferFromImageBitmap((this.#glCanvas as OffscreenCanvas).transferToImageBitmap());
  }
}
