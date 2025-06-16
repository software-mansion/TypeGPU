import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();

const timeUniform = root['~unstable'].createUniform(d.f32);

/**
 * Credits: XorDev (xordev.com) for the idea and original implementation
 * Original GLSL implementation:
 * ```
 * vec3 q,p;for(float z,d,i,l;l++<3e1;z+=d,o+=.1*(vec4(4,2,1,0)-tanh(p.y+4.))*d/(1.+z)){p=z*normalize(FC.rgb*2.-r.xyy)-2.;p.xz-=t+3.;for(q=p,d=p.y,i=4e1;i>.01;i*=.2)d=max(d,min(min(q=i*.9-abs(mod(q,i+i)-i),q.y).x,q.z)),q.xz*=rotate2D(9.);}o=tanh(o*o);
 * ```
 */
const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const nuv = std.normalize(uv);
  const t = timeUniform.value;
  let q = d.vec3f();
  let p = d.vec3f();
  let o = d.vec4f();

  let z = 0;
  let dd = 0;
  let i = 0;
  let l = 0;
  while (l++ < 3e1) {
    p = std.sub(std.mul(z, d.vec3f(nuv, 0)), 2.);
    p.x -= t + 3.;
    p.x -= t + 3.;
    for (q = p, dd = p.y, i = 4e1; i > .01; i *= .2) {
      q = std.sub(i * .9, std.abs(std.sub(d.vec3f(q.x % (i + i), q.y % (i + i), q.z % (i + i)), i)));
      dd = std.max(dd, std.min(std.min(q, d.vec3f(q.y)).x, q.z));
      // TODO: The 9. could be in radians, or in degrees
      const rotMat = rotate2D(9.);
      const rotQ = std.mul(q.xz, rotMat);
      q.x = rotQ.x;
      q.z = rotQ.y;
    }
    z += dd;
    o += .1 * (d.vec4f(4, 2, 1, 0) - std.tanh(p.y + 4.)) * dd / (1. + z);
  }
  o = std.tanh(std.mul(o, o));
});

// TODO: Implement tanh in `typegpu/std`
const tanh = tgpu['~unstable'].fn([d.f32], d.f32)`(angle) -> f32 {
  
}`;

const rotate2D = tgpu['~unstable'].fn([d.f32], d.mat2x2f)((angle) => {
  return d.mat2x2f(
    // right
    std.cos(angle), std.sin(angle),
    // up
    -std.sin(angle), std.cos(angle),
  );
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: pos[input.vertexIndex],
  };
});

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

function draw() {
  timeUniform.write((performance.now() * 0.001) % 1000);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}

draw();

export function onCleanup() {
  root.destroy();
}
