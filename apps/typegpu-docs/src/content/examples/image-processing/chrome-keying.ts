/*
{
  "title": "Chrome Keying",
  "category": "image-processing"
}
*/

import {
  addElement,
  addSliderPlumParameter,
  onCleanup,
  onFrame,
} from '@typegpu/example-toolkit';
import { builtin, createRuntime, wgsl } from 'typegpu';
import { f32, vec2f, vec3f } from 'typegpu/data';

const width = 500;
const height = 375;
const [table, video, canvas] = await Promise.all([
  addElement('table', {
    label: 'Press anywhere on the video to pick a color',
  }),
  addElement('video', { width, height }),
  addElement('canvas', { width, height }),
]);
table.setMatrix([[0, 255, 0]]);

let stream: MediaStream;

if (navigator.mediaDevices.getUserMedia) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  video.srcObject = stream;
} else {
  throw new Error('getUserMedia not supported');
}

const runtime = await createRuntime();
const device = runtime.device;

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const mediaProcessor = new MediaStreamTrackProcessor({
  track: stream.getVideoTracks()[0],
});
const reader = mediaProcessor.readable.getReader();

const thresholdPlum = addSliderPlumParameter('threshold', 0.5, {
  min: 0.0,
  max: 1.0,
  step: 0.01,
});

const thresholdBuffer = wgsl
  .buffer(f32, thresholdPlum)
  .$name('threshold')
  .$allowUniform();
const colorBuffer = wgsl
  .buffer(vec3f, [0, 1.0, 0])
  .$name('colorBuffer')
  .$allowUniform();

video.addEventListener('click', (event) => {
  const x = event.offsetX;
  const y = event.offsetY;
  const canvas = document.createElement('canvas');
  const context2d = canvas.getContext('2d');
  if (!context2d) throw new Error('2d context not supported');
  canvas.width = width;
  canvas.height = height;
  context2d.drawImage(video, 0, 0, width, height);
  const pixel = context2d.getImageData(x, y, 1, 1).data;
  table.setMatrix([[pixel[0], pixel[1], pixel[2]]]);
  runtime.writeBuffer(colorBuffer, [
    pixel[0] / 255.0,
    pixel[1] / 255.0,
    pixel[2] / 255.0,
  ]);
});

async function getFrame() {
  const frame = (await reader.read()).value;
  if (!frame) throw new Error('No frame');
  return frame;
}

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const externalTexture = wgsl.textureExternal();

const resultTexture = wgsl
  .texture({
    size: {
      width,
      height,
    },
    format: 'rgba8unorm',
  })
  .$allowSampled()
  .$allowStorage();

const computeProgram = runtime.makeComputePipeline({
  code: wgsl`
    let coords = vec2u(${builtin.globalInvocationId}.xy);
    if (coords.x >= ${width} || coords.y >= ${height}) {
      return;
    }
    let xyAsUv = vec2f(coords) / vec2f(${width}, ${height});
    var col = textureSampleBaseClampToEdge(${externalTexture}, ${sampler}, xyAsUv);
    let toKey = ${colorBuffer.asUniform()};
    let distance = distance(col.rgb, toKey);

    if (distance < ${thresholdBuffer.asUniform()}) {
      col = vec4f();
    }

    textureStore(
      ${resultTexture.asStorage({
        type: 'texture_storage_2d',
        access: 'write',
      })},
      coords,
      col,
    );
  `,
  workgroupSize: [8, 8],
});

const renderProgram = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      const pos = array(
        vec2( 1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0, -1.0),
        vec2( 1.0,  1.0),
        vec2(-1.0, -1.0),
        vec2(-1.0,  1.0),
      );

      const uv = array(
        vec2(1.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(0.0, 0.0),
      );

      let Position = vec4(pos[${builtin.vertexIndex}], 0.0, 1.0);
      let fragUV = uv[${builtin.vertexIndex}];
    `,
    output: {
      [builtin.position]: 'Position',
      fragUV: vec2f,
    },
  },
  fragment: {
    code: wgsl`
      return textureSampleBaseClampToEdge(${resultTexture.asSampled({ type: 'texture_2d', dataType: f32 })}, ${sampler}, fragUV);
    `,
    target: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

async function drawFrame() {
  const frame = await getFrame();
  runtime.setSource(externalTexture, frame);

  computeProgram.execute({
    workgroups: [Math.ceil(width / 8), Math.ceil(height / 8), 1],
  });

  renderProgram.execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    vertexCount: 6,
  });

  runtime.flush();

  frame.close();
}

onFrame(() => {
  if (!(video.currentTime > 0)) {
    return;
  }

  drawFrame();
});

onCleanup(() => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
  reader.cancel();
});
