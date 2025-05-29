import tgpu, { type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';

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

let defaultLUTTexture: TgpuTexture;
let currentLUTTexture: TgpuTexture;
let imageTexture: TgpuTexture;

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const lutParamsBuffer = root.createBuffer(LUTParams).$usage('uniform');
const adjustmentsBuffer = root.createBuffer(Adjustments).$usage('uniform');

const shaderCode = /* wgsl */ `
@vertex
fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput {
  const vertices = array<vec2f, 4>(
    vec2f(-1.0, -1.0), // Bottom-left
    vec2f(-1.0,  1.0), // Top-left
    vec2f( 1.0, -1.0), // Bottom-right
    vec2f( 1.0,  1.0)  // Top-right
  );

  let pos = vertices[index];
  var output: VertexOutput;
  output.position = vec4f(pos, 0.0, 1.0);

  output.uv = vec2f((pos.x + 1.0) * 0.5, 1.0 - (pos.y + 1.0) * 0.5);
  return output;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(inTexture, inSampler, uv).rgb;
  let inputLuminance = dot(color, vec3f(0.299, 0.587, 0.114));
  let normColor = clamp((color - lut.min) / (lut.max - lut.min), vec3f(0.0), vec3f(1.0));
  let lutColor = select(color, textureSampleLevel(currentLUTTexture, lutSampler, normColor, 0.0).rgb, bool(lut.enabled));

  let normalizedLutColor = clamp(lutColor, vec3f(0.0), vec3f(1.0));
  let biasedExposure = adjustments.exposure * 0.25;
  let exposureColor = normalizedLutColor * pow(2.0, biasedExposure);
  let exposureLuminance = inputLuminance * pow(2.0, biasedExposure);
  let clampedExposureColor = clamp(exposureColor, vec3f(0.0), vec3f(2.0));
  let clampedExposureLuminance = clamp(exposureLuminance, 0.0, 2.0);

  let contrastColor = (clampedExposureColor - vec3f(0.5)) * adjustments.contrast + vec3f(0.5);
  let contrastLuminance = (clampedExposureLuminance - 0.5) * adjustments.contrast + 0.5;

  let luminance = dot(contrastColor, vec3f(0.299, 0.587, 0.114));
  let highlightWeight = smoothstep(0.5, 1.0, luminance);
  let adjustment = adjustments.highlights - 1.0;
  let scaledAdjustment = select(adjustment * 0.25, adjustment, adjustments.highlights >= 1.0);
  let highlightFactor = 1.0 + scaledAdjustment * 0.5 * luminance;
  let highlightAdjust = contrastColor * highlightFactor;
  let highlightColor = mix(contrastColor, clamp(highlightAdjust, vec3f(0.0), vec3f(1.0)), highlightWeight);
  let highlightLuminanceAdjust = contrastLuminance * highlightFactor;
  let highlightLuminance = mix(contrastLuminance, clamp(highlightLuminanceAdjust, 0.0, 1.0), highlightWeight);

  let shadowWeight = 1.0 - luminance;
  let shadowAdjust = pow(highlightColor, vec3f(1.0 / adjustments.shadows));
  let toneColor = mix(highlightColor, shadowAdjust, shadowWeight);
  let shadowLuminanceAdjust = pow(highlightLuminance, 1.0 / adjustments.shadows);
  let toneLuminance = mix(highlightLuminance, shadowLuminanceAdjust, shadowWeight);

  let finalToneColor = clamp(toneColor, vec3f(0.0), vec3f(1.0));
  let grayscaleColor = vec3f(toneLuminance);
  let finalColor = mix(grayscaleColor, finalToneColor, adjustments.saturation);

  return vec4f(finalColor, 1.0);
}
`;

function render() {

  if (!defaultLUTTexture) {
    // Not yet initialized
    return;
  }

  const uniformLayout = tgpu.bindGroupLayout({
    currentLUTTexture: { texture: 'float', dimension: '3d', viewDimension: '3d', sampleType: 'float' },
    lutSampler: { sampler: 'filtering' },
    lut: { uniform: LUTParams },
    adjustments: { uniform: Adjustments },
  });

  const renderLayout = tgpu.bindGroupLayout({
    inTexture: { texture: 'float', dimension: '2d', sampleType: 'float' },
    inSampler: { sampler: 'filtering' },
  });

  const lutSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const imageSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const uniformBindGroup = root.createBindGroup(uniformLayout, {
    currentLUTTexture: root.unwrap(currentLUTTexture).createView({ dimension: '3d' }),
    lutSampler,
    lut: lutParamsBuffer,
    adjustments: adjustmentsBuffer,
  });

  const renderBindGroup = root.createBindGroup(renderLayout, {
    inTexture: root.unwrap(imageTexture).createView(),
    inSampler: imageSampler,
  });

  const shaderModule = device.createShaderModule({
    code: tgpu.resolve({
      template: shaderCode,
      externals: {
        VertexOutput: d.struct({
          position: d.builtin.position,
          uv: d.location(0, d.vec2f),
        }),
        ...uniformLayout.bound,
        ...renderLayout.bound,
      },
    }),
  });

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(uniformLayout), root.unwrap(renderLayout)],
    }),
    vertex: { module: shaderModule },
    fragment: {
      module: shaderModule,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    }],
  };

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, root.unwrap(uniformBindGroup));
  pass.setBindGroup(1, root.unwrap(renderBindGroup));
  pass.draw(4);
  pass.end();

  device.queue.submit([encoder.finish()]);
}

async function init() {
  const response = await fetch('/TypeGPU/Lenna.png');
  const imageBitmap = await createImageBitmap(await response.blob());
  const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];

  imageTexture = root['~unstable']
    .createTexture({
      size: [srcWidth, srcHeight],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: root.unwrap(imageTexture) },
    [srcWidth, srcHeight],
  );

  defaultLUTTexture = root['~unstable']
    .createTexture({
      size: [1, 1, 1],
      format: 'rgba16float',
      dimension: '3d',
    })
    .$usage('sampled');
  
  currentLUTTexture = defaultLUTTexture;

  lutParamsBuffer.writePartial({ enabled: 0 });

  render();
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

    if (!parsed.data)
        throw new Error(`${file} is corrupted`);

    lutParamsBuffer.write({
      size: d.f32(parsed.size),
      min: d.vec3f(parsed.domain[0][0], parsed.domain[0][1], parsed.domain[0][2]),
      max: d.vec3f(parsed.domain[1][0], parsed.domain[1][1], parsed.domain[1][2]),
      enabled: 1,
    });

    if (currentLUTTexture !== defaultLUTTexture)
      currentLUTTexture.destroy();

    currentLUTTexture = root['~unstable']
      .createTexture({
        size: [parsed.size, parsed.size, parsed.size],
        format: 'rgba16float',
        dimension: '3d',
      })
      .$usage('sampled');

    device.queue.writeTexture(
      { texture: root.unwrap(currentLUTTexture) },
      parsed.data,
      {
        bytesPerRow: parsed.size * 4 * 2,
        rowsPerImage: parsed.size,
      },
      [parsed.size, parsed.size, parsed.size]
    );
}

// #endregion

// #region Example controls and cleanup

const LUTFiles = {
  None: '',
  Chrome: '/TypeGPU/assets/image-tuning/classic_chrome.cube',
  Hollywood: '/TypeGPU/assets/image-tuning/hollywoodblue_day.cube',
  Dramatic: '/TypeGPU/assets/image-tuning/dramatic_blockbuster_33.cube',
  'Pro Neg': '/TypeGPU/assets/image-tuning/pro_neg_hi_srgb.cube',
  'Cold Ice': '/TypeGPU/assets/image-tuning/tinyglade_cold_ice.cube',
  Bluecine: '/TypeGPU/assets/image-tuning/tinyglade_bluecine_75.cube',
  'Sam Kolder': '/TypeGPU/assets/image-tuning/tinyglade_sam_kolder.cube',
};

export const controls = {
  'color grading': {
    options: Object.keys(LUTFiles),
    onSelectChange: async (selected: keyof typeof LUTFiles) => {
      if (selected === 'None') {
        currentLUTTexture = defaultLUTTexture;
        lutParamsBuffer.writePartial({ enabled: 0 });
      } else {
        await updateLUT(LUTFiles[selected]);
      }
      render();
    },
  },
  exposure: {
    initial: 0.0,
    min: -2.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(value: number) {
      adjustmentsBuffer.writePartial({ exposure: value });
      render();
    },
  },
  contrast: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(value: number) {
      adjustmentsBuffer.writePartial({ contrast: value });
      render();
    },
  },
  highlights: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(value: number) {
      adjustmentsBuffer.writePartial({ highlights: value });
      render();
    },
  },
  shadows: {
    initial: 1.0,
    min: 0.1,
    max: 1.9,
    step: 0.01,
    onSliderChange(value: number) {
      adjustmentsBuffer.writePartial({ shadows: value });
      render();
    },
  },
  saturation: {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(value: number) {
      adjustmentsBuffer.writePartial({ saturation: value });
      render();
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion

// Initialize Application
init();
