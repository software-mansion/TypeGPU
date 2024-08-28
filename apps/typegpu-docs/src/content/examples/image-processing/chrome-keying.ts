/*
{
  "title": "Chrome Keying",
  "category": "image-processing"
}
*/

import {
  addElement,
  addSliderPlumParameter,
  onFrame,
} from '@typegpu/example-toolkit';
import { builtin, createRuntime, wgsl } from 'typegpu';
import { arrayOf, f32, vec2f, vec3f, vec4u } from 'typegpu/data';

const width = 500;
const height = 375;

const [video, canvas] = await Promise.all([
  addElement('video', { width, height }),
  addElement('canvas', { width, height }),
]);
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

const thresholdPlum = addSliderPlumParameter('threshold', 0, {
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

const first: VideoFrame = await getFrame();
const externalTexture = wgsl.textureExternal({
  source: first,
});
first.close();

const resultBuffer = wgsl
  .buffer(arrayOf(vec4u, width * height))
  .$name('resultBuffer')
  .$allowMutable();
const alphaTexture = wgsl
  .texture({
    size: {
      width,
      height,
    },
    format: 'rgba8unorm',
  })
  .$allowSampled();

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
      let alpha = textureSample(${alphaTexture.asSampled({
        type: 'texture_2d',
        dataType: f32,
      })}, ${sampler}, fragUV).a;
      let color = textureSampleBaseClampToEdge(${externalTexture}, ${sampler}, fragUV) * alpha;
      return vec4f(color.rgb, alpha);
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

const computeProgram = runtime.makeComputePipeline({
  code: wgsl`
    let coords = vec2u(${builtin.globalInvocationId}.xy);
    let xyAsUv = vec2f(coords) / vec2f(${width}, ${height});
    var col = textureSampleBaseClampToEdge(${externalTexture}, ${sampler}, xyAsUv);
    let toKey = ${colorBuffer.asUniform()};
    let distance = distance(col.rgb, toKey);

    if (distance < ${thresholdBuffer.asUniform()}) {
      col = vec4f();
    }

    let index = coords.y * ${width} + coords.x;
    let colUInt = vec4u(min(col * 255, vec4f(255.0)));
    ${resultBuffer.asMutable()}[index] = colUInt;
  `,
});

const frameStorage = {
  frames: [] as EncodedVideoChunk[],
  async push(frame: EncodedVideoChunk) {
    this.frames.push(frame);
  },
  async pop(): Promise<EncodedVideoChunk | undefined> {
    return this.frames.shift();
  },
};

const pendingFrames = [] as VideoFrame[];

const startTimestamp = performance.now();
const encoderConfig: VideoEncoderConfig = {
  codec: 'vp09.00.10.08',
  width,
  height,
  bitrate: 2_000_000,
  framerate: 30,
};
const decoderConfig: VideoDecoderConfig = {
  codec: 'vp09.00.10.08',
  codedWidth: width,
  codedHeight: height,
};
const [supportedEncoder, supportedDecoder] = await Promise.all([
  await VideoEncoder.isConfigSupported(encoderConfig),
  await VideoDecoder.isConfigSupported(decoderConfig),
]);
let encoder: VideoEncoder;
let decoder: VideoDecoder;
if (supportedEncoder && supportedDecoder) {
  encoder = new VideoEncoder({
    output(chunk, metadata) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const encoded = new EncodedVideoChunk({
        timestamp: performance.now() - startTimestamp,
        type: 'key',
        data,
      });
      frameStorage.push(encoded);
    },
    error(e) {
      console.error('Error', e);
    },
  });
  encoder.configure(encoderConfig);

  decoder = new VideoDecoder({
    output(frame) {
      pendingFrames.push(frame);
    },
    error(e) {
      console.error('Error', e);
    },
  });
  decoder.configure(decoderConfig);
} else {
  throw new Error('Unsupported configuration');
}

let frameInProcess = false;
let frameCounter = 0;
let time = 0;
onFrame((delta) => {
  if (time <= 0) {
    time += delta;
    return;
  }
  time = 0;

  if (!(video.currentTime > 0)) {
    return;
  }

  (async () => {
    if (frameInProcess) {
      return;
    }
    frameInProcess = true;
    const frame = await getFrame();
    externalTexture.descriptor.source = frame;

    computeProgram.execute({
      workgroups: [width, height],
    });
    const res = (await runtime.readBuffer(resultBuffer)).flat();
    const data = new Uint8Array(res);
    device.queue.writeTexture(
      { texture: runtime.textureFor(alphaTexture) },
      data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      {
        width,
        height,
      },
    );

    const processedFrame = new VideoFrame(data, {
      format: 'RGBA',
      codedHeight: height,
      codedWidth: width,
      timestamp: performance.now() - startTimestamp,
    });

    const keyFrame = frameCounter % 150 === 0;
    encoder.encode(frame, { keyFrame });
    processedFrame.close();
    frame.close();
    frameCounter++;
    frameInProcess = false;
  })();

  if (frameStorage.frames.length > 0) {
    (async () => {
      const frame = await frameStorage.pop();
      if (frame) {
        decoder.decode(frame);
      }
    })();
  }

  if (pendingFrames.length > 0) {
    const frame = pendingFrames.shift();
    if (frame) {
      externalTexture.descriptor.source = frame;
      renderProgram.execute({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],

        vertexCount: 6,
      });

      runtime.flush();
      frame.close();
    }
  }
});
