import type React from 'react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PassContext } from '../context/pass-context.tsx';
import type { RenderPass } from '../../../typegpu/src/core/root/rootTypes.ts'; // TODO: Expose it in typegpu
import { useCanvas } from '../hooks/use-canvas.ts';

export function Pass({ children }: { children: React.ReactNode }) {
  const { root, context, addFrameCallback } = useCanvas();
  const drawCalls = useRef(new Set<(pass: RenderPass) => void>()).current;
  const [depthTexture, setDepthTexture] = useState<GPUTexture | null>(null);

  const addDrawCall = useCallback(
    (cb: (pass: RenderPass) => void) => {
      drawCalls.add(cb);
      return () => drawCalls.delete(cb);
    },
    [drawCalls],
  );

  useEffect(() => {
    const removeFrameCallback = addFrameCallback(() => {
      const canvas = context.canvas as HTMLCanvasElement;
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
        setDepthTexture(newDepthTexture);
        return; // Skip frame to allow state update
      }

      root['~unstable'].beginRenderPass(
        {
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
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
          drawCalls.forEach((draw) => draw(pass));
        },
      );
    });

    return () => {
      removeFrameCallback();
      depthTexture?.destroy();
    };
  }, [addFrameCallback, context, root, drawCalls, depthTexture]);

  return (
    <PassContext.Provider value={{ addDrawCall }}>
      {children}
    </PassContext.Provider>
  );
}