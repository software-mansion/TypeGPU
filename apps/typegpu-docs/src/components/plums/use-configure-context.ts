import { useRoot } from '@typegpu/react';
import { type RefCallback, type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import type { TgpuRoot } from 'typegpu';

// TODO: Upstream `remapSize` to `useConfigureContext` in @typegpu/react, and drop this copy

export interface ConfigureContextOptions {
  alphaMode?: GPUCanvasAlphaMode;
  /**
   * Changes the size of the canvas, in device pixels, before it's applied. Useful for rendering
   * at a lower resolution than the display has.
   */
  remapSize?: (width: number, height: number) => [width: number, height: number];
}

export interface ConfigureContextResult {
  ref: RefCallback<HTMLCanvasElement>;
  ctxRef: RefObject<GPUCanvasContext | null>;
}

/**
 * Keeps the canvas at the resolution of the pixels it covers on the screen (as passed through
 * `remapSize`), returns a cleanup function.
 */
function observeSize(canvas: HTMLCanvasElement, remapSize: ConfigureContextOptions['remapSize']) {
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    // Not supported in Safari, where the CSS size is scaled by the pixel ratio instead
    const devicePixels = entry.devicePixelContentBoxSize?.[0];
    const cssPixels = entry.contentBoxSize[0];
    let width = devicePixels?.inlineSize ?? (cssPixels?.inlineSize ?? 0) * devicePixelRatio;
    let height = devicePixels?.blockSize ?? (cssPixels?.blockSize ?? 0) * devicePixelRatio;
    if (remapSize) {
      [width, height] = remapSize(width, height);
    }
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
  });

  try {
    // Also notified when only the pixel ratio changes, like when zooming
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}

function useConfigureContextWithRoot(
  root: TgpuRoot | null,
  { remapSize, ...configureOptions }: ConfigureContextOptions,
): ConfigureContextResult {
  const ctxRef = useRef<GPUCanvasContext>(null);
  const remapSizeRef = useRef(remapSize);
  useLayoutEffect(() => {
    remapSizeRef.current = remapSize;
  });

  // A new callback for a new root, React then detaches the old one and configures the canvas again
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const stopObserving = observeSize(canvas, (width, height) =>
        remapSizeRef.current ? remapSizeRef.current(width, height) : [width, height],
      );
      ctxRef.current = root ? root.configureContext({ canvas, ...configureOptions }) : null;

      return () => {
        stopObserving();
        ctxRef.current = null;
      };
    },
    // The options only apply when configuring
    [root],
  );

  return { ref, ctxRef };
}

/** Like `useConfigureContext` from @typegpu/react, with a `remapSize` option */
export function useConfigureContext(options: ConfigureContextOptions = {}) {
  return useConfigureContextWithRoot(useRoot(), options);
}

/**
 * The WebGL 2 counterpart of `useConfigureContext`, for a root made with `initWithGL`. The canvas
 * gets configured once the root is there.
 */
export function useConfigureContextGL(
  root: TgpuRoot | null,
  options: ConfigureContextOptions = {},
) {
  return useConfigureContextWithRoot(root, options);
}
