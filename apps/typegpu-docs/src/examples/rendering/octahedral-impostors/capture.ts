import { d, type TgpuRoot } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { modelVertexLayout, type Model } from './load-model.ts';
import { padDepth } from './pad-depth.ts';
import {
  captureDistance,
  captureRadius,
  frameBasis,
  octDecode,
  viewsPerAxis,
  frameResolution,
} from './impostor.ts';

export function captureAtlas(root: TgpuRoot, model: Model) {
  const frameCount = viewsPerAxis ** 2;

  const size = [frameResolution, frameResolution, frameCount] as const;
  const color = root
    .createTexture({ size, format: 'rgba8unorm', mipLevelCount: Math.log2(frameResolution) + 1 })
    .$usage('render', 'sampled');
  const depth = root.createTexture({ size, format: 'r32float' }).$usage('render', 'sampled');
  const depthBuffer = root
    .createTexture({ size: [frameResolution, frameResolution], format: 'depth24plus' })
    .$usage('render');

  const captureMatrix = root.createUniform(d.mat4x4f);
  const renderCapture = root
    .createRenderPipeline({
      attribs: modelVertexLayout.attrib,
      targets: { color: { format: 'rgba8unorm' }, depth: { format: 'r32float' } },
      primitive: { cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      vertex: ({ position, normal }) => {
        'use gpu';
        return { $position: captureMatrix.$ * d.vec4f(position, 1), normal };
      },
      fragment: ({ normal, $position }) => {
        'use gpu';
        return {
          color: d.vec4f((normal + 1) * 0.5, 1),
          depth: d.vec4f(2 * captureDistance * $position.z, 0, 0, 0),
        };
      },
    })
    .with(modelVertexLayout, model.vertexBuffer)
    .withDepthStencilAttachment({ view: depthBuffer });

  const projection = mat4.ortho(
    -captureRadius,
    captureRadius,
    -captureRadius,
    captureRadius,
    0,
    2 * captureDistance,
    d.mat4x4f(),
  );

  for (let layer = 0; layer < frameCount; layer++) {
    const coordinates = d.vec2f(layer % viewsPerAxis, Math.floor(layer / viewsPerAxis));
    const direction = octDecode(coordinates.div(viewsPerAxis - 1));
    const { up } = frameBasis(direction);
    const view = mat4.lookAt(direction.mul(captureDistance), [0, 0, 0], up, d.mat4x4f());
    captureMatrix.write(mat4.mul(projection, view, d.mat4x4f()));

    const frameView = { baseArrayLayer: layer, arrayLayerCount: 1, mipLevelCount: 1 };
    renderCapture
      .withColorAttachment({
        color: { view: color.createView('render', frameView) },
        depth: { view: depth.createView('render', frameView) },
      })
      .draw(model.vertexCount);
  }

  color.generateMipmaps();
  const paddedDepth = padDepth(root, depth);
  depth.destroy();
  depthBuffer.destroy();
  captureMatrix.buffer.destroy();
  return {
    color: color.createView(d.texture2dArray()),
    depth: paddedDepth.createView(d.texture2dArray(), { sampleType: 'unfilterable-float' }),
    destroy() {
      color.destroy();
      paddedDepth.destroy();
    },
  };
}
