import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { useMemo, useRef } from 'react';

import { useRoot } from './root-context.tsx';
import { useFrame } from './use-frame.ts';

type InferGPURecord<T> = {
  [K in keyof T]: d.InferGPU<T[K]>;
};

const DefaultVertexInput = {
  vertexIndex: d.builtin.vertexIndex,
};

const DefaultVertexOutput = {
  pos: d.builtin.position,
  uv: d.vec2f,
};

const DefaultVarying = {
  uv: d.vec2f,
};

const DefaultFragmentInput = {
  uv: d.vec2f,
};

type VertexFnInput = InferGPURecord<typeof DefaultVertexInput>;
type VertexFnOutput = InferGPURecord<typeof DefaultVertexOutput>;
type FragmentFnOutput = d.v4f;

export interface UseRenderOptions {
  /**
   * A kernel function that runs per-vertex on the GPU.
   */
  vertex: (input: VertexFnInput) => VertexFnOutput;

  /**
   * A TypeGPU function that runs per-pixel on the GPU.
   */
  fragment: (input: InferGPURecord<typeof DefaultVarying>) => FragmentFnOutput;
}

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

export function useRender(options: UseRenderOptions) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<GPUCanvasContext>(null);
  const root = useRoot();

  // Only considering the first passed-in shaders function.
  // This assumes that users won't swap shaders in the same useRender call,
  // but we can make this more robust by computing a hash with unplugin-typegpu.
  // TODO: You can also use the React Nook trick to track functions based on their
  //       place in the code. Simpler and more reliable? ((x)=>x)``
  const vertexRef = useRef(options.vertex);
  const fragmentRef = useRef(options.fragment);

  const vertexFn = useMemo(() => {
    return tgpu.vertexFn({
      in: { ...DefaultVertexInput },
      out: { ...DefaultVertexOutput },
    })(vertexRef.current);
  }, []);

  const fragmentFn = useMemo(() => {
    return tgpu.fragmentFn({
      in: { ...DefaultFragmentInput },
      out: d.vec4f,
    })(fragmentRef.current);
  }, []);

  const pipeline = useMemo(() => {
    return root.createRenderPipeline({
      vertex: vertexFn,
      // TODO: Fix this
      // eslint-disable-next-line: typescript-eslint(no-explicit-any)
      fragment: fragmentFn as any,
    });
  }, [root, vertexFn, fragmentFn]);

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
