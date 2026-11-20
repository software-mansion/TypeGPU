// A render pipeline drawing into an encoder and a render pass the app owns
import { common, d, tgpu } from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const gpu = precompile((root) => {
  const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return d.vec4f(input.uv, 0, 1);
  });
  return {
    draw: root.createRenderPipeline({ vertex: common.fullScreenTriangle, fragment }),
  };
})(await init());

const root = await init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const pipelines = gpu;

const encoder = root.device.createCommandEncoder();
// A pass of its own, begun on the app's encoder
pipelines.draw.withColorAttachment({ view: context }).with(encoder).draw(3);
// Into a pass the app began
const pass = encoder.beginRenderPass({
  colorAttachments: [
    { view: context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' },
  ],
});
pipelines.draw.with(pass).draw(3);
pass.end();
root.device.queue.submit([encoder.finish()]);
