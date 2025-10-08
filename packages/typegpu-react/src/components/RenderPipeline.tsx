import { useMemo } from 'react';
import { useRoot } from '../context/root-context';
import type * as tgpu from 'typegpu';

export function RenderPipeline({
  vertex,
  fragment,
  children,
}: {
  vertex: tgpu.VertexShader;
  fragment: tgpu.FragmentShader;
  children?: React.ReactNode;
}) {
  const root = useRoot();

  const pipeline = useMemo(() => {
    return root.device.createRenderPipeline({
      vertex,
      fragment,
    });
  }, [root, vertex, fragment]);

  // The children will be rendered within the context of this pipeline.
  // This is a simplified implementation. We'll need to pass the pipeline
  // down to the children that need it.
  return <>{children}</>;
}
