import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

type LUTData = {
  title: string;
  type: string;
  size: number;
  domain: [number, number, number][];
  data: Float16Array | undefined;
};

const LUTParams = d.struct({
  size: d.f32,
  min: d.vec3f,
  max: d.vec3f,
  enabled: d.u32,
});

const Adjustments = d.struct({
  exposure: d.f32,
  contrast: d.f32,
  highlights: d.f32,
  shadows: d.f32,
  saturation: d.f32,
});

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

// Fetching resources
const response = await fetch('/TypeGPU/assets/image-tuning/tiger.png');
const imageBitmap = await createImageBitmap(await response.blob());

const imageTexture = root['~unstable']
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

imageTexture.write(imageBitmap);

const imageView = imageTexture.createView(d.texture2d(d.f32));

const defaultLUTTexture = root['~unstable']
  .createTexture({
    size: [1, 1, 1] as [number, number, number],
    format: 'rgba16float',
    dimension: '3d',
  })
  .$usage('sampled');

let currentLUTTexture = defaultLUTTexture;

const layout = tgpu.bindGroupLayout({
  currentLUTTexture: { texture: d.texture3d(d.f32) },
});

const lut = root.createUniform(LUTParams);
const adjustments = root.createUniform(Adjustments);

const lutSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  addressModeW: 'clamp-to-edge',
});

const imageSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const color = std.textureSample(imageView.$, imageSampler.$, uv).rgb;
  const inputLuminance = std.dot(color, d.vec3f(0.299, 0.587, 0.114));
  const normColor = std.saturate(
    std.div(color.sub(lut.$.min), lut.$.max.sub(lut.$.min)),
  );

  const lutColor = std.select(
    color,
    std.textureSampleLevel(
      layout.$.currentLUTTexture,
      lutSampler.$,
      normColor,
      0,
    ).rgb,
    d.bool(lut.$.enabled),
  );
  const lutColorNormalized = std.saturate(lutColor);

  const exposureBiased = adjustments.$.exposure * 0.25;
  const exposureColor = std.clamp(
    lutColorNormalized.mul(2 ** exposureBiased),
    d.vec3f(0),
    d.vec3f(2),
  );
  const exposureLuminance = std.clamp(
    inputLuminance * (2 ** exposureBiased),
    0,
    2,
  );

  const contrastColor = (exposureColor.sub(0.5))
    .mul(adjustments.$.contrast)
    .add(0.5);

  const contrastLuminance = (exposureLuminance - 0.5) * adjustments.$.contrast +
    0.5;

  const contrastColorLuminance = std.dot(
    contrastColor,
    d.vec3f(0.299, 0.587, 0.114),
  );

  const highlightShift = adjustments.$.highlights - 1;
  const highlightBiased = std.select(
    highlightShift * 0.25,
    highlightShift,
    adjustments.$.highlights >= 1,
  );
  const highlightFactor = 1 + highlightBiased * 0.5 * contrastColorLuminance;
  const highlightWeight = std.smoothstep(0.5, 1.0, contrastColorLuminance);
  const highlightLuminanceAdjust = contrastLuminance * highlightFactor;
  const highlightLuminance = std.mix(
    contrastLuminance,
    std.saturate(highlightLuminanceAdjust),
    highlightWeight,
  );
  const highlightColor = std.mix(
    contrastColor,
    std.saturate(contrastColor.mul(highlightFactor)),
    highlightWeight,
  );

  const shadowWeight = 1 - contrastColorLuminance;
  const shadowAdjust = std.pow(
    highlightColor,
    d.vec3f(1 / adjustments.$.shadows),
  );
  const shadowLuminanceAdjust = highlightLuminance **
    (1 / adjustments.$.shadows);

  const toneColor = std.mix(highlightColor, shadowAdjust, shadowWeight);
  const toneLuminance = std.mix(
    highlightLuminance,
    shadowLuminanceAdjust,
    shadowWeight,
  );

  const finalToneColor = std.saturate(toneColor);
  const grayscaleColor = d.vec3f(toneLuminance);
  const finalColor = std.mix(
    grayscaleColor,
    finalToneColor,
    adjustments.$.saturation,
  );

  return d.vec4f(finalColor, 1);
});

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
  targets: { format: presentationFormat },
});

function render() {
  if (!defaultLUTTexture) {
    // Not yet initialized
    return;
  }

  const group = root.createBindGroup(layout, {
    currentLUTTexture: currentLUTTexture.createView(d.texture3d(d.f32)),
  });

  renderPipeline
    .with(group)
    .withColorAttachment({
      view: context,
      clearValue: [0, 0, 0, 1],
    })
    .draw(3);
}

// #region Fetch and Parse LUT

async function fetchLUT(file: string): Promise<LUTData> {
  const response = await fetch(file);
  const str = await response.text();

  let title = '';
  let type = '';
  let size = 0;
  const domain: [number, number, number][] = [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]];
  let data: Float16Array | undefined;
  let index = 0;

  const lines = str.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed[0] === '#' || trimmed === '') continue;

    const parts = trimmed.split(/\s+/);
    switch (parts[0]) {
      case 'TITLE':
        title = line.slice(7, -1);
        break;
      case 'DOMAIN_MIN':
        domain[0] = parts.slice(1).map(Number) as [number, number, number];
        break;
      case 'DOMAIN_MAX':
        domain[1] = parts.slice(1).map(Number) as [number, number, number];
        break;
      case 'LUT_1D_SIZE':
        throw new Error('This example only supports 3D LUTs');
      case 'LUT_3D_SIZE':
        type = '3D';
        size = Number(parts[1]);
        data = new Float16Array(size * size * size * 4);
        break;
      default:
        if (data) {
          const dataOffset = index * 4;
          data[dataOffset + 0] = Number(parts[0]); // R
          data[dataOffset + 1] = Number(parts[1]); // G
          data[dataOffset + 2] = Number(parts[2]); // B
          data[dataOffset + 3] = 1.0; // A
          index++;
        }
    }
  }

  return { title, type, size, domain, data };
}

async function updateLUT(file: string) {
  const parsed = await fetchLUT(file);

  if (!parsed.data) {
    throw new Error(`${file} is corrupted`);
  }

  lut.write({
    size: parsed.size,
    min: d.vec3f(parsed.domain[0][0], parsed.domain[0][1], parsed.domain[0][2]),
    max: d.vec3f(parsed.domain[1][0], parsed.domain[1][1], parsed.domain[1][2]),
    enabled: 1,
  });

  if (currentLUTTexture !== defaultLUTTexture) {
    currentLUTTexture.destroy();
  }

  currentLUTTexture = root['~unstable']
    .createTexture({
      size: [parsed.size, parsed.size, parsed.size],
      format: 'rgba16float',
      dimension: '3d',
    })
    .$usage('sampled');

  device.queue.writeTexture(
    { texture: root.unwrap(currentLUTTexture) },
    parsed.data.buffer,
    {
      bytesPerRow: parsed.size * 4 * 2,
      rowsPerImage: parsed.size,
    },
    [parsed.size, parsed.size, parsed.size],
  );
}

// #endregion

// #region Example controls and cleanup

const LUTFiles = {
  None: '',
  Chrome:
    'https://raw.githubusercontent.com/abpy/FujifilmCameraProfiles/refs/heads/master/cube%20lut/classic%20chrome.cube',
  Hollywood:
    'https://raw.githubusercontent.com/changyun233/Lumix-V-log-LUTs/refs/heads/main/luts/lumix_color_lab_A/HollywoodBlue_Day.cube',
  Dramatic:
    'https://raw.githubusercontent.com/changyun233/Lumix-V-log-LUTs/refs/heads/main/recommended/Dramatic_BlockBuster_33.cube',
  'Pro Neg':
    'https://raw.githubusercontent.com/abpy/FujifilmCameraProfiles/refs/heads/master/cube%20lut/srgb/pro%20neg%20hi_srgb.cube',
  'Cold Ice':
    'https://raw.githubusercontent.com/aras-p/smol-cube/refs/heads/main/tests/luts/tinyglade-Cold_Ice.cube',
  Bluecine:
    'https://raw.githubusercontent.com/aras-p/smol-cube/refs/heads/main/tests/luts/tinyglade-Bluecine_75.cube',
  'Sam Kolder':
    'https://raw.githubusercontent.com/aras-p/smol-cube/refs/heads/main/tests/luts/tinyglade-Sam_Kolder.cube',
};

export const controls = defineControls({
  'color grading': {
    initial: 'None',
    options: Object.keys(LUTFiles),
    onSelectChange: async (selected) => {
      if (selected === 'None') {
        currentLUTTexture = defaultLUTTexture;
        lut.writePartial({ enabled: 0 });
      } else {
        await updateLUT(LUTFiles[selected as keyof typeof LUTFiles]);
      }
      render();
    },
  },
  exposure: {
    initial: 0.0,
    min: -2.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(value) {
      adjustments.writePartial({ exposure: value });
      render();
    },
  },
  contrast: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(value) {
      adjustments.writePartial({ contrast: value });
      render();
    },
  },
  highlights: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(value) {
      adjustments.writePartial({ highlights: value });
      render();
    },
  },
  shadows: {
    initial: 1.0,
    min: 0.1,
    max: 1.9,
    step: 0.1,
    onSliderChange(value) {
      adjustments.writePartial({ shadows: value });
      render();
    },
  },
  saturation: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(value) {
      adjustments.writePartial({ saturation: value });
      render();
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion

render();
