import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { useRoot } from './root-context.tsx';
import { useMemo, useRef } from 'react';
import { useFrame } from './use-frame.ts';

type InferRecord<T> = {
  [K in keyof T]: d.Infer<T[K]>;
};

export interface UseRenderOptions {
  vertex?: () => void;

  /**
   * A kernel function that runs per-pixel on the GPU.
   */
  fragment: (input: InferRecord<typeof DefaultVarying>) => d.v4f;
}

const DefaultVarying = {
  uv: d.vec2f,
};

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, ...DefaultVarying },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex] as d.v2f, 0, 1),
    uv: uv[input.vertexIndex] as d.v2f,
  };
});

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

export function useRender(options: UseRenderOptions) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<GPUCanvasContext>(null);
  const root = useRoot();

  // Only considering the first passed-in fragment function.
  // This assumes that users won't swap shaders in the same useRender call,
  // but we can make this more robust by computing a hash with unplugin-typegpu.
  // TODO: You can also use the React Nook trick to track functions based on their
  //       place in the code. Simpler and more reliable? ((x)=>x)``
  const fragmentRef = useRef(options.fragment);

  const fragmentFn = useMemo(() => {
    return tgpu['~unstable'].fragmentFn({
      in: { ...DefaultVarying },
      out: d.vec4f,
    })(fragmentRef.current);
  }, []);

  const pipeline = useMemo(() => {
    return root['~unstable']
      .withVertex(fullScreenTriangle, {})
      .withFragment(fragmentFn, { format: presentationFormat })
      .createPipeline();
  }, [root, fragmentFn]);

  useFrame(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (ctxRef.current === null) {
      ctxRef.current = canvas.getContext('webgpu') as GPUCanvasContext;
      ctxRef.current.configure({
        device: root.device,
        format: presentationFormat,
      });
    }

    pipeline
      .withColorAttachment({
        view: ctxRef.current.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
      })
      .draw(3);
  });

  return { ref };
}
