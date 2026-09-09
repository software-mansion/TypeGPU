import type { PreviewMesh } from './demos.ts';
import { d, type TgpuRoot, type TgpuUniform } from 'typegpu';
import * as m from 'wgpu-matrix';
import { fragment, sceneAccess, vertexShader, type Scene, type VertexSchema } from './shaders.ts';

export function createRenderer(
  root: TgpuRoot,
  canvas: HTMLCanvasElement,
  uniforms: TgpuUniform<typeof Scene>,
) {
  const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
  let depth = root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('transient');
  const projection = d.mat4x4f();
  const view = d.mat4x4f();
  const viewProj = d.mat4x4f();
  const eye = d.vec3f();
  const origin = d.vec3f();
  const up = d.vec3f(0, 1, 0);

  function createPipeline(schema: VertexSchema) {
    const { layout, vertex } = vertexShader(schema);
    const pipeline = root.with(sceneAccess, uniforms).createRenderPipeline({
      vertex,
      fragment,
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    return { layout, pipeline };
  }
  const pipelines = new Map<VertexSchema, ReturnType<typeof createPipeline>>();

  return {
    async prepare(mesh: PreviewMesh) {
      let cached = pipelines.get(mesh.schema);
      if (!cached) {
        cached = createPipeline(mesh.schema);
        pipelines.set(mesh.schema, cached);
      }
      const pipeline = cached.pipeline
        .with(
          root.createBindGroup(cached.layout, {
            vertices: mesh.vertices,
            indices: mesh.indices,
          }),
        )
        .withIndexBuffer(mesh.indices);
      await pipeline.initAsync();

      return (wireframe: boolean) => {
        const draw = pipeline
          .withColorAttachment({ view: context, clearValue: [0.09, 0.082, 0.149, 1] })
          .withDepthStencilAttachment({ view: depth, depthStoreOp: 'discard' });
        if (wireframe) draw.draw(mesh.indexCount);
        else draw.drawIndexed(mesh.indexCount);
      };
    },
    updateCamera(seconds: number) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.min(1200, Math.max(1, Math.round(canvas.clientWidth * ratio)));
      const height = Math.min(900, Math.max(1, Math.round(canvas.clientHeight * ratio)));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        depth.destroy();
        depth = root
          .createTexture({ size: [width, height], format: 'depth24plus' })
          .$usage('transient');
      }
      m.mat4.perspective(Math.PI / 5, width / height, 0.1, 100, projection);
      const angle = seconds * 0.4;
      eye.x = Math.cos(angle) * 2.6;
      eye.y = 1.3;
      eye.z = Math.sin(angle) * 2.6;
      m.mat4.lookAt(eye, origin, up, view);
      m.mat4.multiply(projection, view, viewProj);
      uniforms.patch({ viewProj });
    },
  };
}
