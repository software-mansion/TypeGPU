import type { TgpuRoot } from '../core/root/rootTypes.ts';

export interface AttachAutoResizerOptions {
  root: TgpuRoot;
  canvas: HTMLCanvasElement;
  onResize?(): void;
}

export function attachAutoResizer({
  root,
  canvas,
  onResize,
}: AttachAutoResizerOptions): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (!entry) {
        return;
      }
      const width =
        entry.devicePixelContentBoxSize?.[0]?.inlineSize ||
        (entry.contentBoxSize[0]?.inlineSize ?? 0) * window.devicePixelRatio;
      const height =
        entry.devicePixelContentBoxSize?.[0]?.blockSize ||
        (entry.contentBoxSize[0]?.blockSize ?? 0) * window.devicePixelRatio;
      const canvas = entry.target as HTMLCanvasElement;
      canvas.width = Math.max(1, Math.min(width, root.device.limits.maxTextureDimension2D));
      canvas.height = Math.max(1, Math.min(height, root.device.limits.maxTextureDimension2D));

      onResize?.();
    }
  });

  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas, { box: 'content-box' });
  }

  return () => {
    observer.disconnect();
  };
}
