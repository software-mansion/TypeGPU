import tgpu, { type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';

type ParsedLUT = {
  title: string,
  type: string,
  size: number,
  domain: number[][],
  data: Float16Array | undefined,
};

const LUTDesc = d.struct({
  lutSize: d.f32,
  lutMin: d.vec3f,
  lutMax: d.vec3f,
  enabled: d.f32,
});

const Adjustments = d.struct({
  exposure: d.f32,
  contrast: d.f32,
  highlights: d.f32,
  shadows: d.f32,
  saturation: d.f32,
});

let lutTexture: TgpuTexture;

const shaderCode = /* wgsl */ `
@vertex
fn main_vert(@builtin(vertex_index) index: u32) -> VertexOutput {
  const pos = array(
    vec2f(1.0,  1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f(-1.0,  1.0),
  );

  const uv = array(
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 0.0),
  );

  var output: VertexOutput;
  output.position = vec4f(pos[index], 0.0, 1.0);
  output.uv = uv[index];
  return output;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(inTexture, inSampler, uv).rgb;
  let lutSize = lut.lutSize;
  let dmin = lut.lutMin;
  let dmax = lut.lutMax;

  let inputLuminance = dot(color, vec3f(0.299, 0.587, 0.114));

  let normColor = clamp((color - dmin) / (dmax - dmin), vec3f(0.0), vec3f(1.0));
  var lutColor = textureSampleLevel(lutTexture, lutSampler, normColor, 0.0).rgb;
  if (lut.enabled == 0) {
    lutColor = color;
  }

  let normalizedLutColor = clamp(lutColor, vec3f(0.0), vec3f(1.0));

  let exposureColor = normalizedLutColor * pow(2.0, adjustments.exposure);
  let exposureLuminance = inputLuminance * pow(2.0, adjustments.exposure);
  let clampedExposureColor = clamp(exposureColor, vec3f(0.0), vec3f(2.0));
  let clampedExposureLuminance = clamp(exposureLuminance, 0.0, 2.0);

  let contrastColor = (clampedExposureColor - vec3f(0.5)) * adjustments.contrast + vec3f(0.5);
  let contrastLuminance = (clampedExposureLuminance - 0.5) * adjustments.contrast + 0.5;

  let luminance = dot(contrastColor, vec3f(0.299, 0.587, 0.114));

  let highlightWeight = smoothstep(0.5, 1.0, luminance);

  let adjustment = adjustments.highlights - 1.0;
  let scaledAdjustment = select(adjustment * 0.25, adjustment, adjustments.highlights >= 1.0);
  let highlightFactor = 1.0 + scaledAdjustment * 0.5 * luminance;

  // let highlightFactor = 1.0 + (adjustments.highlights - 1.0) * 0.5 * (luminance);
  let highlightAdjust = contrastColor * highlightFactor;
  let highlightColor = mix(contrastColor, clamp(highlightAdjust, vec3f(0.0), vec3f(1.0)), highlightWeight);
  let highlightLuminanceAdjust = contrastLuminance * highlightFactor;
  let highlightLuminance = mix(contrastLuminance, clamp(highlightLuminanceAdjust, 0.0, 1.0), highlightWeight);

  let shadowWeight = 1.0 - smoothstep(0.0, 0.3, luminance);
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


const lutDescBuffer = root.createBuffer(LUTDesc).$usage('uniform');
const adjustmentsBuffer = root.createBuffer(Adjustments).$usage('uniform');

//////////////////////////

// Render function
async function render() {
// Define bind group layouts
const uniformLayout = tgpu.bindGroupLayout({
  lutTexture: { texture: 'float', dimension: '3d', viewDimension: '3d', sampleType: 'float' },
  lutSampler: { sampler: 'filtering' },
  lut: { uniform: LUTDesc },
  adjustments: { uniform: Adjustments },
});

const renderLayout = tgpu.bindGroupLayout({
  inTexture: { texture: 'float', dimension: '2d', sampleType: 'float' },
  inSampler: { sampler: 'filtering' },
});

// Vertex and fragment shader code
const VertexOutput = d.struct({
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
});

// Load input image
const response = await fetch('/TypeGPU/Lenna.png');
const imageBitmap = await createImageBitmap(await response.blob());

const [srcWidth, srcHeight] = [imageBitmap.width, imageBitmap.height];
const imageTexture = root['~unstable']
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


// Create samplers
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

// Create bind groups with explicit texture view dimension
const uniformBindGroup = root.createBindGroup(uniformLayout, {
  lutTexture: root.unwrap(lutTexture!).createView({ dimension: '3d' }),
  lutSampler: lutSampler,
  lut: lutDescBuffer,
  adjustments: adjustmentsBuffer,
});

const renderBindGroup = root.createBindGroup(renderLayout, {
  inTexture: imageTexture,
  inSampler: imageSampler,
});

// Create render pipeline
const shaderModule = device.createShaderModule({
  code: tgpu.resolve({
    template: shaderCode,
    externals: { VertexOutput, ...uniformLayout.bound, ...renderLayout.bound },
  }),
});

const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(uniformLayout), root.unwrap(renderLayout)],
  }),
  vertex: {
    module: shaderModule,
  },
  fragment: {
    module: shaderModule,
    targets: [{ format: presentationFormat }],
  },
});

// Render pass descriptor
const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined as unknown as GPUTextureView,
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
};


  (renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment])[0].view =
    context.getCurrentTexture().createView();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, root.unwrap(uniformBindGroup));
  pass.setBindGroup(1, root.unwrap(renderBindGroup));
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
}

  const defaultLUT = root['~unstable']
    .createTexture({
      size: [1, 1, 1],
      format: 'rgba16float',
      dimension: '3d',
    })
    .$usage('sampled');

lutTexture = defaultLUT;
lutDescBuffer.writePartial({enabled: 0})
render();


// Cleanup
export function onCleanup() {
  root.destroy();
}

// #region LUT Cube Parsing



// LUT Parser
function parse(str: string): ParsedLUT {
  let title: string = '';
  let type: string = '';
  let size = 0;
  const domain = [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]];
  let data: Float16Array | undefined = undefined;
  let index: number = 0;

  const lines = str.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line[0] === '#' || line === '') {
      continue;
    }

    const parts = line.split(/\s+/);

    switch (parts[0]) {
      case 'TITLE':
        title = line.slice(7, -1);
        break;
      case 'DOMAIN_MIN':
        domain[0] = parts.slice(1).map(Number);
        break;
      case 'DOMAIN_MAX':
        domain[1] = parts.slice(1).map(Number);
        break;
      case 'LUT_1D_SIZE':
        type = '1D';
        size = Number(parts[1]);
        data = new Float16Array(size * 4);
        break;
      case 'LUT_3D_SIZE':
        type = '3D';
        size = Number(parts[1]);
        data = new Float16Array(size * size * size * 4);
        break;
      default:
        if (data !== undefined) {
          const dataOffset = index * 4;
          data[dataOffset + 0] = Number(parts[0]); // R
          data[dataOffset + 1] = Number(parts[1]); // G
          data[dataOffset + 2] = Number(parts[2]); // B
          data[dataOffset + 3] = 1.0; // A
          index++; // Increment index for the next entry
        }        
    }
  }

  return {
    title,
    type,
    size,
    domain,
    data,
  };
}


async function fetchLUT(file: string): Promise<ParsedLUT> {
  const lutResponse = await fetch(file);
  const lutData = await lutResponse.text();

  let lut = parse(lutData);
  if (lut.type !== '3D') {
    throw new Error('This example only supports 3D LUTs');
  }

  return lut;
}



// #endregion

// #region Example controls and cleanup

const LUTFiles = {
  "None": '',
  "Chrome": '/TypeGPU/assets/cube-luts/classic-chrome.cube',
  "Hollywood": '/TypeGPU/assets/cube-luts/HollywoodBlue_Day.cube',
  "Dramatic": '/TypeGPU/assets/cube-luts/Dramatic_BlockBuster_33.cube',
  "Pro Neg": "/TypeGPU/assets/cube-luts/pro neg hi_srgb.cube",
  "Cold Ice": "/TypeGPU/assets/cube-luts/tinyglade-Cold_Ice.cube",
  "Bluecine": "/TypeGPU/assets/cube-luts/tinyglade-Bluecine_75.cube",
  "Sam Kolder": "/TypeGPU/assets/cube-luts/tinyglade-Sam_Kolder.cube",
  "LMT ACES": "/TypeGPU/assets/cube-luts/resolve-LMT ACES v0.1.1.cube",
};

const settings = {
  exposure: 0.0,
  contrast: 1.0,
  highlights: 1.0,
  shadows: 1.0,
  saturation: 1.0,
}

export const controls = {
  'color lookup': {
    options: Object.keys(LUTFiles),
    onSelectChange: async (selected: keyof typeof LUTFiles) => {
      if (selected == "None") {
        lutTexture = defaultLUT;
        lutDescBuffer.writePartial({enabled: 0})
      } else {
        let parsed = await fetchLUT(LUTFiles[selected]);
        debugger;

        if (parsed.data === undefined) return;

        lutDescBuffer.write({
          lutSize: d.f32(parsed.size),
          lutMin: d.vec3f(parsed.domain[0][0], parsed.domain[0][1], parsed.domain[0][2]),
          lutMax: d.vec3f(parsed.domain[1][0], parsed.domain[1][1], parsed.domain[1][2]),
          enabled: 1,
        });

        lutTexture = root['~unstable']
          .createTexture({
            size: [parsed.size, parsed.size, parsed.size],
            format: 'rgba16float',
            dimension: '3d',
          })
          .$usage('sampled');

        device.queue.writeTexture(
          { texture: root.unwrap(lutTexture) },
          parsed.data,
          {
            bytesPerRow: parsed.size * 4 * 2,
            rowsPerImage: parsed.size,
          },
          [parsed.size, parsed.size, parsed.size]
        );
      }
      await render();

    },
  },

  'exposure': {
    initial: 0.0,
    min: -2.0,
    max: 2.0,
    step: 0.1,
    onSliderChange(newValue: number) {
      settings.exposure = newValue;
      adjustmentsBuffer.writePartial({
        exposure: newValue * 0.25,
      });
      render();
    },
  },
  'contrast': {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(newValue: number) {
      settings.contrast = newValue;
      adjustmentsBuffer.writePartial({
        contrast: newValue,
      });
      render();
    },
  },
  'highlights': {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(newValue: number) {
      settings.highlights = newValue;
      adjustmentsBuffer.writePartial({
        highlights: newValue,
      });
      render();
    },
  },
  'shadows': {
    initial: 1.0,
    min: 0.1,
    max: 1.9,
    step: 0.01,
    onSliderChange(newValue: number) {
      settings.shadows = newValue;
      adjustmentsBuffer.writePartial({
        shadows: newValue,
      });
      render();
    },
  },
  'saturation': {
    initial: 1.0,
    min: 0.0,
    max: 2.0,
    step: 0.01,
    onSliderChange(newValue: number) {
      settings.saturation = newValue;
      adjustmentsBuffer.writePartial({
        saturation: newValue,
      });
      render();
    },
  },
};

// #endregion
