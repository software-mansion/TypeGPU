import {
  oklabGamutClip,
  oklabGamutClipAlphaSlot,
  oklabGamutClipSlot,
  oklabToLinearRgb,
  oklabToRgb,
} from '@typegpu/color';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const cssProbePosition = d.vec2f(0.5, 0.5);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const cssProbe = document.querySelector('#css-probe') as HTMLDivElement;
const probePositionText = document.querySelector(
  '#probe-position',
) as HTMLDivElement;
canvas.parentElement?.appendChild(cssProbe);
canvas.parentElement?.appendChild(probePositionText);
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const cleanupController = new AbortController();

document.addEventListener(
  'mousemove',
  (ev) => {
    const rect = canvas.getBoundingClientRect();
    cssProbePosition.x = (ev.clientX - rect.x) / rect.width;
    cssProbePosition.y = 1 - (ev.clientY - rect.y) / rect.height;
    draw();
  },
  {
    signal: cleanupController.signal,
  },
);

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
}) /* wgsl */`{
    var pos = array<vec2f, 3>(
      vec2(-1, -1),
      vec2(3, -1),
      vec2(-1, 3)
    );

    return Out(vec4f(pos[in.vertexIndex], 0.0, 1.0), pos[in.vertexIndex]);
  }`;

const Uniforms = d.struct({
  hue: d.f32,
  alpha: d.f32,
});

const uniforms = Uniforms({
  hue: 0.7,
  alpha: 0.05,
});

const uniformsBindGroupLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: Uniforms },
});

const uniformsBuffer = root.createBuffer(Uniforms, uniforms).$usage('uniform');
const uniformsBindGroup = root.createBindGroup(uniformsBindGroupLayout, {
  uniforms: uniformsBuffer,
});

const modulo = tgpu['~unstable'].fn(
  [d.f32, d.f32],
  d.f32,
)((a, b) => {
  let m = a % b;
  if (m < 0.0) {
    if (b < 0.0) {
      m -= b;
    } else {
      m += b;
    }
  }
  return m;
});

const scaleView = tgpu['~unstable'].fn(
  [d.vec2f],
  d.vec2f,
)((pos) => {
  'kernel & js';
  return d.vec2f(0.3 * pos.x, (pos.y * 1.2 + 1) * 0.5);
});

const patternCheckers = tgpu['~unstable'].fn(
  [d.vec2f, d.vec3f],
  d.f32,
)((uv, _clipLab) => {
  const stripeX = modulo(uv.x, 0.1) / 0.1 > 0.5;
  const stripeY = modulo(uv.y, 0.1) / 0.1 > 0.5;
  return d.f32(stripeX !== stripeY);
});

const patternL0ProjectionLines = tgpu['~unstable'].fn(
  [d.vec2f, d.vec3f],
  d.f32,
) /* wgsl */`(uv: vec2f, clipLab: vec3f) -> f32 {
  let thickness = fwidth(clipLab.x);
  let Lgrid = 0.02 - thickness - abs(clipLab.x % 0.04 - 0.02);
  return select(clamp(Lgrid / fwidth(Lgrid), 0, 1), 1, thickness < 0.0002);
}`;

const patternSolid = tgpu['~unstable'].fn([d.vec2f, d.vec3f], d.f32)(() => 1);
const patternSlot = tgpu['~unstable'].slot(patternSolid);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
}) /* wgsl */`{
  let pos = scaleView(in.uv);
  let lab = vec3f(
    pos.y,
    pos.x * vec2f(cos(uniforms.hue), sin(uniforms.hue))
  );
  let rgb = oklabToLinearRgb(lab);
  let outOfGamut = any(rgb < vec3f(0)) || any(rgb > vec3f(1));

  let clipLab = gamutClip(lab);
  let color = oklabToRgb(lab);

  let patternScaled = pattern(in.uv, clipLab) * 0.1 + 0.9;

  return vec4f(select(color, color * patternScaled, outOfGamut), 1);
}`.$uses({
  scaleView,
  oklabToRgb,
  oklabToLinearRgb,
  uniforms: uniformsBindGroupLayout.bound.uniforms,
  gamutClip: oklabGamutClipSlot,
  pattern: patternSlot,
});

const alphaFromUniforms = tgpu['~unstable'].fn(
  [],
  d.f32,
)(() => uniformsBindGroupLayout.bound.uniforms.value.alpha);

let pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, {
    format: presentationFormat,
  })
  .createPipeline();

function setPipeline({
  outOfGamutPattern,
  gamutClip,
}: {
  outOfGamutPattern: d.Infer<typeof patternSlot>;
  gamutClip: d.Infer<typeof oklabGamutClipSlot>;
}) {
  pipeline = root['~unstable']
    .with(patternSlot, outOfGamutPattern)
    .with(oklabGamutClipSlot, gamutClip)
    .with(oklabGamutClipAlphaSlot, alphaFromUniforms)
    .withVertex(mainVertex, {})
    .withFragment(mainFragment, {
      format: presentationFormat,
    })
    .createPipeline();
}

function draw() {
  const pos = scaleView(
    d.vec2f(cssProbePosition.x * 2 - 1, cssProbePosition.y * 2 - 1),
  );
  const lightness = pos.y;
  const chroma = pos.x;
  const a = chroma * Math.cos(uniforms.hue);
  const b = chroma * Math.sin(uniforms.hue);
  cssProbe.style.setProperty('--x', `${cssProbePosition.x * 100}%`);
  cssProbe.style.setProperty('--y', `${cssProbePosition.y * 100}%`);
  canvas.parentElement?.style.setProperty('--l', `${lightness}`);
  canvas.parentElement?.style.setProperty('--a', `${a}`);
  canvas.parentElement?.style.setProperty('--b', `${b}`);
  canvas.parentElement?.style.setProperty('--hue', `${uniforms.hue}rad`);

  probePositionText.innerText = `
    oklab(${lightness.toFixed(2)} ${a.toFixed(2)} ${b.toFixed(2)})
  `;

  pipeline
    .with(uniformsBindGroupLayout, uniformsBindGroup)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
}

setTimeout(() => {
  draw();
}, 100);

// #region Example controls and cleanup

const gamutClipOptions = {
  'Ad. L 0.5': oklabGamutClip.adaptiveL05,
  'Ad. L Cusp': oklabGamutClip.adaptiveL0Cusp,
  'Preserve Chroma': oklabGamutClip.preserveChroma,
};

const outOfGamutPatternOptions = {
  Checker: patternCheckers,
  'Proj. Lines': patternL0ProjectionLines,
  Solid: patternSolid,
};

const selections = {
  gamutClip: oklabGamutClip.adaptiveL05,
  outOfGamutPattern: patternL0ProjectionLines,
};

export const controls = {
  Hue: {
    initial: 0,
    min: 0,
    max: 2 * Math.PI,
    step: 0.001,
    onSliderChange: (hue: number) => {
      uniforms.hue = hue;
      uniformsBuffer.writePartial({ hue });
      draw();
    },
  },
  'Gamut Clip': {
    options: Object.keys(gamutClipOptions),
    onSelectChange: (selected: keyof typeof gamutClipOptions) => {
      selections.gamutClip = gamutClipOptions[selected];
      setPipeline(selections);
      draw();
    },
  },
  alpha: {
    initial: 0.05,
    min: 0,
    max: 1,
    step: 0.001,
    onSliderChange: (alpha: number) => {
      uniforms.alpha = alpha;
      uniformsBuffer.writePartial({ alpha });
      draw();
    },
  },
  'Out of Gamut Pattern': {
    options: Object.keys(outOfGamutPatternOptions),
    onSelectChange: (selected: keyof typeof outOfGamutPatternOptions) => {
      selections.outOfGamutPattern = outOfGamutPatternOptions[selected];
      setPipeline(selections);
      draw();
    },
  },
};

export function onCleanup() {
  root.destroy();
  cleanupController.abort();
}

// #endregion
