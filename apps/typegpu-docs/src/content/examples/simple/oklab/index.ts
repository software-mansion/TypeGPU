import {
  oklabGamutClip,
  oklabGamutClipAlphaAccess,
  oklabGamutClipSlot,
  oklabToLinearRgb,
  oklabToRgb,
} from '@typegpu/color';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { any, cos, floor, gt, lt, mul, select, sin } from 'typegpu/std';

const cssProbePosition = d.vec2f(0.5, 0.5);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const cssProbe = document.querySelector('#css-probe') as HTMLDivElement;
const probePositionText = document.querySelector(
  '#probe-position',
) as HTMLDivElement;
if (canvas.parentElement) {
  canvas.parentElement.style.overflow = 'hidden';
  canvas.parentElement.appendChild(cssProbe);
  canvas.parentElement.appendChild(probePositionText);
}
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

const Uniforms = d.struct({
  hue: d.f32,
  alpha: d.f32,
});

const layout = tgpu.bindGroupLayout({
  uniforms: { uniform: Uniforms },
});

const scaleView = tgpu.fn([d.vec2f], d.vec2f)((pos) => {
  return d.vec2f(0.3 * pos.x, (pos.y * 1.2 + 1) * 0.5);
});

// #region Patterns

const patternFn = tgpu.fn([d.vec2f, d.vec3f], d.f32);

const patternCheckers = patternFn((uv) => {
  'kernel';
  const suv = floor(mul(20, uv));
  return suv.x + suv.y - 2 * floor((suv.x + suv.y) * 0.5);
});

const patternL0ProjectionLines =
  patternFn /* wgsl */`(uv: vec2f, clipLab: vec3f) -> f32 {
    let thickness = fwidth(clipLab.x);
    let Lgrid = 0.02 - thickness - abs(clipLab.x % 0.04 - 0.02);
    return select(clamp(Lgrid / fwidth(Lgrid), 0, 1), 1, thickness < 0.0002);
  }`;

const patternSolid = patternFn(() => {
  'kernel';
  return 1;
});

const patternSlot = tgpu.slot(patternSolid);

// #endregion

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const hue = layout.$.uniforms.hue;
  const pos = scaleView(input.uv);
  const lab = d.vec3f(pos.y, mul(pos.x, d.vec2f(cos(hue), sin(hue))));
  const rgb = oklabToLinearRgb(lab);
  const outOfGamut = any(lt(rgb, d.vec3f(0))) || any(gt(rgb, d.vec3f(1)));

  const clipLab = oklabGamutClipSlot.$(lab);
  const color = oklabToRgb(lab);

  const patternScaled = patternSlot.$(input.uv, clipLab) * 0.1 + 0.9;

  return d.vec4f(select(color, mul(patternScaled, color), outOfGamut), 1);
});

const alphaFromUniforms = tgpu.fn([], d.f32)(() => layout.$.uniforms.alpha);

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const uniforms = Uniforms({
  hue: 0.7,
  alpha: 0.05,
});

const uniformsBuffer = root.createBuffer(Uniforms, uniforms).$usage('uniform');
const bindGroup = root.createBindGroup(layout, {
  uniforms: uniformsBuffer,
});

let pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
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
    .with(oklabGamutClipAlphaAccess, alphaFromUniforms)
    .withVertex(fullScreenTriangle, {})
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
    .with(layout, bindGroup)
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
