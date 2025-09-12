import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { useRoot } from './root-context.tsx';
import { useMemo, useRef } from 'react';
import { useFrame } from './use-frame.ts';

type InferRecord<T> = {
  [K in keyof T]: d.Infer<T[K]>;
};

const DefaultVertexInput = {
  vertexIndex: d.builtin.vertexIndex,
};

const DefaultVertexOutput = {
  pos: d.builtin.position,
  uv: d.vec2f,
};

const DefaultFragmentInput = {
  uv: d.vec2f,
};

type VertexFnInput = InferRecord<typeof DefaultVertexInput>;
type VertexFnOutput = InferRecord<typeof DefaultVertexOutput>;
type FragmentFnInput = InferRecord<typeof DefaultFragmentInput>;
type FragmentFnOutput = d.v4f;

export interface UseRenderOptions {
  /**
   * A kernel function that runs per-vertex on the GPU.
   */
  vertex: (input: VertexFnInput) => VertexFnOutput;

  /**
   * A kernel function that runs per-pixel on the GPU.
   */
  fragment: (input: FragmentFnInput) => FragmentFnOutput;
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
    return tgpu['~unstable'].vertexFn({
      in: { ...DefaultVertexInput },
      out: { ...DefaultVertexOutput },
    })(vertexRef.current);
  }, []);

  const fragmentFn = useMemo(() => {
    return tgpu['~unstable'].fragmentFn({
      in: { ...DefaultFragmentInput },
      out: d.vec4f,
    })(fragmentRef.current);
  }, []);

  const pipeline = useMemo(() => {
    return root['~unstable']
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: presentationFormat })
      .createPipeline();
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
