import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { RenderPass } from '../../../typegpu/src/core/root/rootTypes.ts'; // TODO: Expose it in typegpu
import { PassContext } from '../context/pass-context.tsx';
import { useCanvas } from '../hooks/use-canvas.ts';
import { useRoot } from '../hooks/use-root.ts';

export function Pass(
  { children }: { children: React.ReactNode; schedule: 'frame' },
) {
  const root = useRoot();
  const ctx = useCanvas();
  const drawCalls = useRef(new Set<(pass: RenderPass) => void>()).current;
  const depthTextureRef = useRef<GPUTexture | null>(null);

  const addDrawCall = useCallback(
    (cb: (pass: RenderPass) => void) => {
      drawCalls.add(cb);
      return () => drawCalls.delete(cb);
    },
    [drawCalls],
  );

  useEffect(() => {
    const removeFrameCallback = ctx.addFrameCallback(() => {
      const canvas = ctx.context?.canvas as HTMLCanvasElement;
      let depthTexture = depthTextureRef.current;
      if (
        !depthTexture ||
        depthTexture.width !== canvas.width ||
        depthTexture.height !== canvas.height
      ) {
        depthTexture?.destroy();
        const newDepthTexture = root.device.createTexture({
          size: [canvas.width, canvas.height],
          format: 'depth24plus',
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        depthTexture = depthTextureRef.current = newDepthTexture;
      }

      root['~unstable'].beginRenderPass(
        {
          colorAttachments: [
            {
              view: ctx.context?.getCurrentTexture()
                .createView() as GPUTextureView,
              clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        },
        (pass) => {
          drawCalls.forEach((draw) => {
            draw(pass);
          });
        },
      );
    });

    return () => {
      removeFrameCallback();
      depthTextureRef.current?.destroy();
      depthTextureRef.current = null;
    };
  }, [ctx, root, drawCalls]);

  return (
    <PassContext.Provider value={{ addDrawCall }}>
      {children}
    </PassContext.Provider>
  );
}
