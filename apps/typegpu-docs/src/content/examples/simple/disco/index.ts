import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mainVertex } from './shaders/vertex.ts';
import { palette } from './utils.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();
const device = root.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Uniforms
const time = root.createUniform(d.f32, 0);
const w = root.createUniform(d.f32, canvas.width);
const h = root.createUniform(d.f32, canvas.height);

export const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  {
    let newuv = std.mul(std.sub(uv.xy, 0.5), 2.0);
    newuv.y *= h.$ / w.$;
    const uvv = newuv;
    const finalColor = d.vec3f(0.0, 0.0, 0.0);
    for (let i = 0.0; i < 5.0; i++) {
      newuv = std.sub(
        std.fract(std.mul(newuv, 1.3 * std.sin(time.$))),
        0.5,
      );
      let len = std.length(newuv) * std.exp(-std.length(uvv) * 2);
      const col = palette(std.length(uvv) + time.$ * 0.9);
      len = std.sin(len * 8 + time.$) / 8;
      len = std.abs(len);
      len = std.smoothstep(0.0, 0.1, len);
      len = 0.06 / len;
      finalColor.x += col.x * len;
      finalColor.y += col.y * len;
      finalColor.z += col.z * len;
    }
    return d.vec4f(finalColor, 1.0);
  }
});

// == PIPELINE ==
const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

// == RENDER LOOP ==
let startTime = performance.now();
let frameId: number;

function render() {
  const timestamp = (performance.now() - startTime) / 1000;
  if (timestamp > 500.0) startTime = performance.now();
  time.write(timestamp);
  // Keep uniforms in sync with any external resize logic
  w.write(canvas.width);
  h.write(canvas.height);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(6);

  frameId = requestAnimationFrame(render);
}

frameId = requestAnimationFrame(render);

// == CLEANUP ==
export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
