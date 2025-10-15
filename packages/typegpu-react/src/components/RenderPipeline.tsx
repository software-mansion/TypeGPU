import type React from 'react';
import {
  useEffect,
  useMemo,
  useRef,
} from 'react';
import tgpu from 'typegpu';
import type * as d from 'typegpu/data';
// TODO: Export these types in typegpu
import type { VertexInConstrained, VertexOutConstrained } from '../../../typegpu/src/core/function/tgpuVertexFn.ts';
import type { OmitBuiltins } from '../../../typegpu/src/builtin.ts';
import type { FragmentInConstrained, FragmentOutConstrained } from '../../../typegpu/src/core/function/tgpuFragmentFn.ts';
import type { RenderPass } from '../../../typegpu/src/core/root/rootTypes.ts';
import type { LayoutToAllowedAttribs } from '../../../typegpu/src/core/vertexLayout/vertexAttribute.ts';
// TODO:
import { usePass } from '../hooks/use-pass.ts';
import { useCanvas } from '../hooks/use-canvas.ts';
import { PipelineContext } from '../context/pipeline-context.tsx';

type InferRecord<T> = { [K in keyof T]: d.Infer<T[K]> };

interface VertexOptions<
  VIn extends VertexInConstrained,
  VOut extends VertexOutConstrained,
> {
  body: (input: InferRecord<VIn>) => InferRecord<VOut>;
  in: VIn;
  out: VOut;
  attributes: LayoutToAllowedAttribs<OmitBuiltins<VIn>>;
}

interface FragmentOptions<
  FIn extends FragmentInConstrained,
  FOut extends FragmentOutConstrained,
> {
  body: (input: InferRecord<FIn>) => d.Infer<FOut>;
  in: FIn;
  out: FOut;
}

interface RenderPipelineProps<
  VIn extends VertexInConstrained,
  VOut extends VertexOutConstrained,
  FIn extends FragmentInConstrained,
  FOut extends FragmentOutConstrained,
> {
  vertex: VertexOptions<VIn, VOut>;
  fragment: FragmentOptions<FIn, FOut>;
  vertexCount: number;
  instanceCount?: number;
  children?: React.ReactNode;
}

// TODO: Alter this hook when .withVertex and .withFragment will be simplified
export function RenderPipeline<
  VIn extends VertexInConstrained,
  VOut extends VertexOutConstrained,
  FIn extends VertexOutConstrained & FragmentInConstrained,
  FOut extends FragmentOutConstrained,
>({
  vertex,
  fragment,
  vertexCount,
  instanceCount,
  children,
}: RenderPipelineProps<VIn, VOut, FIn, FOut> & { fragmentIn?: OmitBuiltins<VOut> }) {
  const { root } = useCanvas();
  const { addDrawCall } = usePass();
  const drawCommand = useRef<(pass: RenderPass) => void>(() => {});

  const vertexRef = useRef(vertex.body);
  const fragmentRef = useRef(fragment.body);

  const pipeline = useMemo(() => {
    const vertexFn = tgpu['~unstable'].vertexFn({ in: vertex.in, out: vertex.out })(vertexRef.current);
    const fragmentFn = tgpu['~unstable'].fragmentFn({ in: fragment.in, out: fragment.out })(
      fragmentRef.current,
    );

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    return root['~unstable']
      .withVertex(vertexFn, vertex.attributes)
      .withFragment(fragmentFn, { format: presentationFormat })
      .withDepthStencil({
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      })
      .createPipeline();
  }, [root, vertex, fragment]);

  useEffect(() => {
    const removeDrawCall = addDrawCall((pass) => {
      pass.setPipeline(pipeline);
      // Children will set buffers and bind groups here before drawing.
      // This function is captured by the closure and will be executed
      // with the latest context from its children.
      drawCommand.current(pass);
    });
    return removeDrawCall;
  }, [addDrawCall, pipeline]);

  // This function will be updated by children (like VertexBuffer, BindGroup)
  // to set their resources on the pass.
  drawCommand.current = (pass: RenderPass) => {
    pass.draw(vertexCount, instanceCount);
  };

  return (
    <PipelineContext.Provider value={pipeline}>
      {children}
    </PipelineContext.Provider>
  );
}