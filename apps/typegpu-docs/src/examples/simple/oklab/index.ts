import {
  oklabGamutClip,
  oklabGamutClipAlphaAccess,
  oklabGamutClipSlot,
  oklabToLinearRgb,
  oklabToRgb,
} from '@typegpu/color';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const cssProbePosition = d.vec2f(0.5, 0.5);

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const cssProbe = document.querySelector('#css-probe') as HTMLDivElement;
const probePositionText = document.querySelector('#probe-position') as HTMLDivElement;
if (canvas.parentElement) {
  canvas.parentElement.style.overflow = 'hidden';
  canvas.parentElement.appendChild(cssProbe);
  canvas.parentElement.appendChild(probePositionText);
}
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

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

const scaleView = (pos: d.v2f): d.v2f => {
  'use gpu';
  return d.vec2f(0.3 * pos.x, (pos.y * 1.2 + 1) * 0.5);
};

// #region Patterns

const patternFn = tgpu.fn([d.vec2f, d.vec3f], d.f32);

const patternCheckers = patternFn((uv) => {
  'use gpu';
  const suv = std.floor(uv.mul(20));
  return suv.x + suv.y - 2 * std.floor((suv.x + suv.y) * 0.5);
});

const patternL0ProjectionLines = patternFn((_uv, clipLab) => {
  'use gpu';
  const thickness = std.fwidth(clipLab.x);
  const Lgrid = 0.02 - thickness - std.abs((clipLab.x % 0.04) - 0.02);
  return std.select(std.clamp(Lgrid / std.fwidth(Lgrid), 0, 1), 1, thickness < 0.0002);
});

const patternSolid = patternFn(() => {
  'use gpu';
  return 1;
});

const patternSlot = tgpu.slot(patternSolid);

// #endregion

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  // remapping to (-1, 1)
  const uv = input.uv.sub(0.5).mul(d.vec2f(2, -2));

  const hue = uniforms.$.hue;
  const pos = scaleView(uv);
  const yzDir = d.vec2f(std.cos(hue), std.sin(hue));
  const lab = d.vec3f(pos.y, yzDir.mul(pos.x));
  const rgb = oklabToLinearRgb(lab);
  const outOfGamut = std.any(std.lt(rgb, d.vec3f(0))) || std.any(std.gt(rgb, d.vec3f(1)));

  const clipLab = oklabGamutClipSlot.$(lab);
  const color = oklabToRgb(lab);

  const patternScaled = patternSlot.$(uv, clipLab) * 0.1 + 0.9;

  return d.vec4f(std.select(color, color.mul(patternScaled), outOfGamut), 1);
});

const uniforms = root.createUniform(
  d.struct({
    hue: d.f32,
    alpha: d.f32,
  }),
);

const uniformsValue = {
  hue: 0.7,
  alpha: 0.05,
};

let pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: mainFragment,
});

function setPipeline({
  outOfGamutPattern,
  gamutClip,
}: {
  outOfGamutPattern: typeof patternSlot.$;
  gamutClip: typeof oklabGamutClipSlot.$;
}) {
  pipeline = root
    .with(patternSlot, outOfGamutPattern)
    .with(oklabGamutClipSlot, gamutClip)
    .with(oklabGamutClipAlphaAccess, () => uniforms.$.alpha)
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: mainFragment,
    });
}

function draw() {
  const pos = scaleView(d.vec2f(cssProbePosition.x * 2 - 1, cssProbePosition.y * 2 - 1));
  const lightness = pos.y;
  const chroma = pos.x;
  const a = chroma * Math.cos(uniformsValue.hue);
  const b = chroma * Math.sin(uniformsValue.hue);
  cssProbe.style.setProperty('--x', `${cssProbePosition.x * 100}%`);
  cssProbe.style.setProperty('--y', `${cssProbePosition.y * 100}%`);
  canvas.parentElement?.style.setProperty('--l', `${lightness}`);
  canvas.parentElement?.style.setProperty('--a', `${a}`);
  canvas.parentElement?.style.setProperty('--b', `${b}`);
  canvas.parentElement?.style.setProperty('--hue', `${uniformsValue.hue}rad`);

  probePositionText.innerText = `
    oklab(${lightness.toFixed(2)} ${a.toFixed(2)} ${b.toFixed(2)})
  `;

  pipeline.withColorAttachment({ view: context }).draw(3);
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

export const controls = defineControls({
  Hue: {
    initial: 0,
    min: 0,
    max: 2 * Math.PI,
    step: 0.001,
    onSliderChange: (hue: number) => {
      uniformsValue.hue = hue;
      uniforms.writePartial({ hue });
      draw();
    },
  },
  'Gamut Clip': {
    initial: 'Ad. L 0.5',
    options: Object.keys(gamutClipOptions),
    onSelectChange: (selected) => {
      selections.gamutClip = gamutClipOptions[selected as keyof typeof gamutClipOptions];
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
      uniformsValue.alpha = alpha;
      uniforms.writePartial({ alpha });
      draw();
    },
  },
  'Out of Gamut Pattern': {
    initial: 'Checker',
    options: Object.keys(outOfGamutPatternOptions),
    onSelectChange: (selected) => {
      selections.outOfGamutPattern =
        outOfGamutPatternOptions[selected as keyof typeof outOfGamutPatternOptions];
      setPipeline(selections);
      draw();
    },
  },
});

export function onCleanup() {
  root.destroy();
  cleanupController.abort();
}

// #endregion
