import tgpu, { type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';

type ParsedLUT = {
  title: string,
  type: string,
  size: number,
  domain: number[][],
  data: number[][],
};

let lut: ParsedLUT;
/* = {
  title: "No LUT",
  type: "3D",
  size: 2,
  domain: [[0,0,0], [1,1,1]],
  data: [[1,1,1], [1,1,1], [1,1,1], [1,1,1], [1,1,1], [1,1,1], [1,1,1], [1,1,1]]
};*/


const LUTDesc = d.struct({
  lutSize: d.f32,
  lutMin: d.vec3f,
  lutMax: d.vec3f,
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

  let normColor = clamp((color - dmin) / (dmax - dmin), vec3f(0.0), vec3f(1.0));
  let result = textureSampleLevel(lutTexture, lutSampler, normColor, 0.0).rgb;

  // Convert linear RGB to sRGB
  let srgbColor = pow(result, vec3f(1.0 / 2.2));

  return vec4f(srgbColor, 1.0);
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

//////////////////////////

// Render function
async function render() {
// Define bind group layouts
const uniformLayout = tgpu.bindGroupLayout({
  lutTexture: { texture: 'float', dimension: '3d', viewDimension: '3d', sampleType: 'float' },
  lutSampler: { sampler: 'filtering' },
  lut: { uniform: LUTDesc }
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

// Create 2D texture array for LUT
//  = root['~unstable']
//   .createTexture({
//     size: [lut!.size, lut!.size, lut!.size],
//     format: 'rgba16float',
//     dimension: '3d',
//   })
//   .$usage('sampled');



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

// render();


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
  const data: number[][] = [];

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
        break;
      case 'LUT_3D_SIZE':
        type = '3D';
        size = Number(parts[1]);
        break;
      default:
        data.push(parts.map(Number));
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


async function fetchLUT(file: string) {
  // Load and parse LUT data
  const lutResponse = await fetch(file);
  const lutData = await lutResponse.text();

  lut = parse(lutData);
  if (lut.type !== '3D') {
    throw new Error('This example only supports 3D LUTs');
  }

  if (lut !== undefined)
  {
    // Convert LUT data to a flat Float32Array for 2D texture array
    const flatLutData = new Float16Array(lut.size * lut.size * lut.size * 4);
    let index = 0;
    for (let r = 0; r < lut.size; r++) {
      for (let g = 0; g < lut.size; g++) {
        for (let b = 0; b < lut.size; b++) {
          const dataIndex = b + g * lut.size + r * lut.size * lut.size;

          flatLutData[index++] = lut.data[dataIndex][0]; // R
          flatLutData[index++] = lut.data[dataIndex][1]; // G
          flatLutData[index++] = lut.data[dataIndex][2]; // B
          flatLutData[index++] = 1.0; // A
        }
      }
    }

    lutDescBuffer.write({
      lutSize: d.f32(lut!.size),
      lutMin: d.vec3f(lut!.domain[0][0], lut!.domain[0][1], lut!.domain[0][2]),
      lutMax: d.vec3f(lut!.domain[1][0], lut!.domain[1][1], lut!.domain[1][2]),
    });

    lutTexture = root['~unstable']
      .createTexture({
        size: [lut.size, lut.size, lut.size],
        format: 'rgba16float',
        dimension: '3d',
      })
      .$usage('sampled');

    device.queue.writeTexture(
      { texture: root.unwrap(lutTexture) },
      flatLutData,
      {
        bytesPerRow: lut.size * 4 * 2, // 4 channels, 2 bytes per float
        rowsPerImage: lut.size,
      },
      [lut.size, lut.size, lut.size]
    );
  }
}



// #endregion


const LUTFiles = {
  "Classic Chrome": '/TypeGPU/assets/cube-luts/classic-chrome.cube',
  "HollywoodBlue Day": '/TypeGPU/assets/cube-luts/HollywoodBlue_Day.cube',
  "Dramatic_BlockBuster_33": '/TypeGPU/assets/cube-luts/Dramatic_BlockBuster_33.cube',
  "pro neg hi_srgb.cube": "/TypeGPU/assets/cube-luts/pro neg hi_srgb.cube",
  "tinyglade-Cold_Ice.cube": "/TypeGPU/assets/cube-luts/tinyglade-Cold_Ice.cube",
  "tinyglade-Bluecine_75.cube": "/TypeGPU/assets/cube-luts/tinyglade-Bluecine_75.cube",
  "tinyglade-Sam_Kolder.cube": "/TypeGPU/assets/cube-luts/tinyglade-Sam_Kolder.cube",
  "resolve-LMT ACES v0.1.1.cube": "/TypeGPU/assets/cube-luts/resolve-LMT ACES v0.1.1.cube",
};

const selections = {
  lut: LUTFiles['Classic Chrome']
}

export const controls = {
  'LUT': {
    options: Object.keys(LUTFiles),
    onSelectChange: async (selected: keyof typeof LUTFiles) => {
      selections.lut = LUTFiles[selected];
      await fetchLUT(LUTFiles[selected]);
debugger;
      await render();
    },
  },
};
