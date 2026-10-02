import type { TgpuRoot } from '../core/root/rootTypes.ts';

export interface AttachAutoResizerOptions {
  root: TgpuRoot;
  canvas: HTMLCanvasElement;
  onResize?: (() => void) | undefined;
}

export interface AutoResizer {
  detach: () => void;
}

/**
 * Returns the physical (device pixel) size of the observed element, falling back to
 * the CSS size multiplied by the device pixel ratio when the browser does not report it.
 */
function getPhysicalSize(entry: ResizeObserverEntry): [width: number, height: number] {
  // Not every browser supports `devicePixelContentBoxSize` (e.g. Safari), despite what the types say.
  const dpcb = entry.devicePixelContentBoxSize?.[0];
  if (dpcb) {
    return [dpcb.inlineSize, dpcb.blockSize];
  }

  const dpr = window.devicePixelRatio || 1;
  // Older browsers expose `contentBoxSize` as a single object instead of an array.
  const contentBoxSize = entry.contentBoxSize as
    | readonly ResizeObserverSize[]
    | ResizeObserverSize
    | undefined;
  const cb = Array.isArray(contentBoxSize)
    ? (contentBoxSize[0] as ResizeObserverSize | undefined)
    : (contentBoxSize as ResizeObserverSize | undefined);

  if (cb) {
    return [cb.inlineSize * dpr, cb.blockSize * dpr];
  }

  return [entry.contentRect.width * dpr, entry.contentRect.height * dpr];
}

function getMaxCanvasSize(root: TgpuRoot): number {
  try {
    return root.device.limits.maxTextureDimension2D;
  } catch {
    // Roots that are not backed by a WebGPU device (e.g. the WebGL fallback) don't expose
    // device limits. Falling back to the minimum value guaranteed by WebGPU.
    return 8192;
  }
}

/**
 * Keeps the canvas' internal resolution (`canvas.width` and `canvas.height`) in sync with
 * the physical size it takes up on the screen. The resolution is clamped to what the
 * device supports.
 *
 * @param options.onResize Called right after the canvas has been resized. Changing the canvas
 *   resolution clears its contents, so this is a good place to re-render the frame, and to
 *   resize any resolution-dependent resources.
 *
 * @example
 * ```ts
 * const autoResizer = common.attachAutoResizer({
 *   root,
 *   canvas,
 *   onResize() {
 *     render();
 *   },
 * });
 *
 * // Later, when the canvas is no longer used
 * autoResizer.detach();
 * ```
 */
export function attachAutoResizer({
  root,
  canvas,
  onResize,
}: AttachAutoResizerOptions): AutoResizer {
  const maxSize = getMaxCanvasSize(root);
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const [width, height] = getPhysicalSize(entry);
      const target = entry.target as HTMLCanvasElement;
      target.width = Math.max(1, Math.min(Math.round(width), maxSize));
      target.height = Math.max(1, Math.min(Math.round(height), maxSize));

      onResize?.();
    }
  });

  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    try {
      observer.observe(canvas, { box: 'content-box' });
    } catch {
      // The `box` option is not supported at all
      observer.observe(canvas);
    }
  }

  return {
    detach: () => {
      observer.disconnect();
    },
  };
}
