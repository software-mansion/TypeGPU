import type * as d from 'typegpu/data';
import tgpu, {
  type TgpuBuffer,
  type TgpuVertexLayout,
  type VertexFlag,
} from 'typegpu';
import { useRoot } from './root-context.tsx';
import { useMemo, useRef } from 'react';
import { useFrame } from './use-frame.ts';
import type {
  FragmentInConstrained,
  FragmentOutConstrained,
} from '../../typegpu/src/core/function/tgpuFragmentFn.ts';
import type {
  VertexInConstrained,
  VertexOutConstrained,
} from '../../typegpu/src/core/function/tgpuVertexFn.ts';
import type { OmitBuiltins } from '../../typegpu/src/builtin.ts';

type InferRecord<T> = {
  [K in keyof T]: d.Infer<T[K]>;
};

export interface UseRenderOptions<
  VIn extends VertexInConstrained,
  VOut extends VertexOutConstrained,
  FIn extends FragmentInConstrained,
  FOut extends FragmentOutConstrained,
  TData extends d.WgslArray | d.Disarray,
> {
  /**
   * The input layout for the vertex shader.
   */
  vertexIn: VIn;

  /**
   * The output layout for the vertex shader.
   */
  vertexOut: VOut;

  /**
   * A kernel function that runs per-vertex on the GPU.
   */
  vertex: (input: InferRecord<VIn>) => InferRecord<VOut>;

  /**
   * The input layout for the fragment shader.
   */
  fragmentIn: FIn;

  /**
   * The output layout for the fragment shader.
   */
  fragmentOut: FOut;

  /**
   * A kernel function that runs per-pixel on the GPU.
   */
  fragment: (input: InferRecord<FIn>) => d.Infer<FOut>;

  /**
   * Layout describing the data structure in the vertex buffer.
   */
  vertexLayout?: TgpuVertexLayout;

  /**
   * Buffer with model geometry.
   */
  vertexBuffer?: TgpuBuffer<TData> & VertexFlag;

  /**
   * The number of vertices to draw.
   */
  vertexCount: number;

  /**
   * Enables depth testing. Defaults to `false`.
   */
  depthTest?: boolean;
}

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

export function useRender<
  VIn extends VertexInConstrained,
  VOut extends VertexOutConstrained,
  FIn extends VertexOutConstrained & FragmentInConstrained,
  FOut extends FragmentOutConstrained,
  TData extends d.WgslArray | d.Disarray,
>(
  options:
    & UseRenderOptions<
      VIn,
      VOut,
      FIn,
      FOut,
      TData
    >
    & { fragmentIn?: OmitBuiltins<VOut> },
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<GPUCanvasContext>(null);
  const depthTextureRef = useRef<GPUTexture | null>(null);
  const root = useRoot();

  // Only considering the first passed-in fragment function.
  // This assumes that users won't swap shaders in the same useRender call,
  // but we can make this more robust by computing a hash with unplugin-typegpu.
  // TODO: You can also use the React Nook trick to track functions based on their
  //       place in the code. Simpler and more reliable? ((x)=>x)``
  const vertexRef = useRef(options.vertex);
  const fragmentRef = useRef(options.fragment);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const vertexFn = useMemo(() => {
    return tgpu['~unstable'].vertexFn({
      in: options.vertexIn,
      out: options.vertexOut,
    })(vertexRef.current);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const fragmentFn = useMemo(() => {
    return tgpu['~unstable'].fragmentFn({
      in: options.fragmentIn,
      out: options.fragmentOut,
    })(fragmentRef.current);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const pipeline = useMemo(() => {
    let pipelineBuilder = root['~unstable']
      .withVertex(
        vertexFn,
        options.vertexLayout ? options.vertexLayout.attrib : undefined,
      )
      .withFragment(fragmentFn, { format: presentationFormat });

    if (options.depthTest) {
      pipelineBuilder = pipelineBuilder.withDepthStencil({
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      });
    }

    return pipelineBuilder.createPipeline();
  }, [root, options]);

  useFrame(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (ctxRef.current === null) {
      ctxRef.current = canvas.getContext('webgpu') as GPUCanvasContext;
      ctxRef.current.configure({
        device: root.device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });
    }

    if (
      options.depthTest &&
      (depthTextureRef.current === null ||
        depthTextureRef.current.width !== canvas.width)
    ) {
      depthTextureRef.current?.destroy();
      depthTextureRef.current = root.device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    let renderPass = pipeline.withColorAttachment({
      view: ctxRef.current.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
    });

    if (options.depthTest) {
      renderPass = renderPass.withDepthStencilAttachment({
        view: depthTextureRef.current.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      });
    }

    if (options.vertexLayout && options.vertexBuffer) {
      renderPass = renderPass.with(options.vertexLayout, options.vertexBuffer);
    }

    renderPass.draw(options.vertexCount);
  });

  return { ref };
}
