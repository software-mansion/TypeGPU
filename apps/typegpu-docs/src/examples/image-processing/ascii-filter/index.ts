import tgpu, { type TgpuBindGroup } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();

const layout = tgpu.bindGroupLayout({
  externalTexture: { externalTexture: {} },
});

const charsetExtended = root.createUniform(d.u32);
const displayMode = root.createUniform(d.u32);
const gammaCorrection = root.createUniform(d.f32);
const glyphSize = root.createUniform(d.u32, 8);
const uvTransformBuffer = root
  .createUniform(d.mat2x2f, d.mat2x2f.identity());

const shaderSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const displayModes = {
  color: 0,
  grayscale: 1,
  white: 2,
} as const;

/**
 * Adapted from the original Shadertoy implementation by movAX13h:
 * https://www.shadertoy.com/view/lssGDj
 */
const characterFn = tgpu.fn([d.u32, d.vec2f], d.f32)((n, p) => {
  // Transform texture coordinates to character bitmap coordinates (5x5 grid)
  const pos = std.floor(p.mul(d.vec2f(-4, 4)).add(2.5));

  // Check if position is outside the 5x5 character bitmap bounds
  if (pos.x < 0 || pos.x > 4 || pos.y < 0 || pos.y > 4) {
    return 0;
  }

  // Convert 2D bitmap position to 1D bit index (row-major order)
  const a = d.u32(pos.x + 5 * pos.y);
  // Extract the bit at position 'a' from the character bitmap 'n'
  return d.f32((n >> a) & 1);
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

/**
 * Adapted from the original Shadertoy implementation by movAX13h:
 * https://www.shadertoy.com/view/lssGDj
 */
const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv2 = std.mul(uvTransformBuffer.$, input.uv.sub(0.5)).add(0.5);
  const textureSize = d.vec2f(std.textureDimensions(layout.$.externalTexture));
  const pix = uv2.mul(textureSize);

  const cellSize = d.f32(glyphSize.$);
  const halfCell = cellSize * 0.5;

  const blockCoord = std.floor(pix.div(cellSize))
    .mul(cellSize).div(textureSize);

  const color = std.textureSampleBaseClampToEdge(
    layout.$.externalTexture,
    shaderSampler,
    blockCoord,
  );

  const rawGray = 0.3 * color.x + 0.59 * color.y + 0.11 * color.z;
  const gray = std.pow(rawGray, gammaCorrection.$);

  let n = d.u32(4096);
  if (charsetExtended.$ === 0) {
    if (gray > 0.2) n = 65600; // :
    if (gray > 0.3) n = 163153; // *
    if (gray > 0.4) n = 15255086; // o
    if (gray > 0.5) n = 13121101; // &
    if (gray > 0.6) n = 15252014; // 8
    if (gray > 0.7) n = 13195790; // @
    if (gray > 0.8) n = 11512810; // #
  } else {
    if (gray > 0.0233) n = 4096;
    if (gray > 0.0465) n = 131200;
    if (gray > 0.0698) n = 4329476;
    if (gray > 0.0930) n = 459200;
    if (gray > 0.1163) n = 4591748;
    if (gray > 0.1395) n = 12652620;
    if (gray > 0.1628) n = 14749828;
    if (gray > 0.1860) n = 18393220;
    if (gray > 0.2093) n = 15239300;
    if (gray > 0.2326) n = 17318431;
    if (gray > 0.2558) n = 32641156;
    if (gray > 0.2791) n = 18393412;
    if (gray > 0.3023) n = 18157905;
    if (gray > 0.3256) n = 17463428;
    if (gray > 0.3488) n = 14954572;
    if (gray > 0.3721) n = 13177118;
    if (gray > 0.3953) n = 6566222;
    if (gray > 0.4186) n = 16269839;
    if (gray > 0.4419) n = 18444881;
    if (gray > 0.4651) n = 18400814;
    if (gray > 0.4884) n = 33061392;
    if (gray > 0.5116) n = 15255086;
    if (gray > 0.5349) n = 32045584;
    if (gray > 0.5581) n = 18405034;
    if (gray > 0.5814) n = 15022158;
    if (gray > 0.6047) n = 15018318;
    if (gray > 0.6279) n = 16272942;
    if (gray > 0.6512) n = 18415153;
    if (gray > 0.6744) n = 32641183;
    if (gray > 0.6977) n = 32540207;
    if (gray > 0.7209) n = 18732593;
    if (gray > 0.7442) n = 18667121;
    if (gray > 0.7674) n = 16267326;
    if (gray > 0.7907) n = 32575775;
    if (gray > 0.8140) n = 15022414;
    if (gray > 0.8372) n = 15255537;
    if (gray > 0.8605) n = 32032318;
    if (gray > 0.8837) n = 32045617;
    if (gray > 0.9070) n = 33081316;
    if (gray > 0.9302) n = 32045630;
    if (gray > 0.9535) n = 33061407;
    if (gray > 0.9767) n = 11512810;
  }

  const p = d.vec2f(
    ((pix.x / halfCell) % 2) - 1,
    ((pix.y / halfCell) % 2) - 1,
  );

  const charValue = characterFn(n, p);

  let resultColor = d.vec3f(1);
  // Color mode
  if (displayMode.$ === displayModes.color) {
    resultColor = color.mul(charValue).xyz;
  }
  // Grayscale mode
  if (displayMode.$ === displayModes.grayscale) {
    resultColor = d.vec3f(gray * charValue);
  }
  // White mode
  if (displayMode.$ === displayModes.white) {
    resultColor = d.vec3f(charValue);
  }
  return d.vec4f(resultColor, 1.0);
});

const video = document.querySelector('video') as HTMLVideoElement;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const spinner = document.querySelector('.spinner-background') as HTMLDivElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

canvas.parentElement?.appendChild(video);

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentFn, { format: presentationFormat })
  .createPipeline();

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    },
  });
}

let bindGroup:
  | TgpuBindGroup<{
    externalTexture: { externalTexture: Record<string, never> };
  }>
  | undefined;

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined = undefined;

function processVideoFrame(
  _: number,
  metadata: VideoFrameCallbackMetadata,
) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  const frameWidth = metadata.width;
  const frameHeight = metadata.height;

  if (
    !lastFrameSize ||
    lastFrameSize.width !== frameWidth ||
    lastFrameSize.height !== frameHeight
  ) {
    lastFrameSize = { width: frameWidth, height: frameHeight };

    updateVideoDisplay(frameWidth, frameHeight);
  }

  bindGroup = root.createBindGroup(layout, {
    externalTexture: root.device.importExternalTexture({ source: video }),
  });
  if (!bindGroup) {
    console.warn('Bind group is not ready yet.');

    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  pipeline
    .with(layout, bindGroup)
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView(),
    })
    .draw(3);

  spinner.style.display = 'none';

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

function updateVideoDisplay(frameWidth: number, frameHeight: number) {
  const aspectRatio = frameWidth / frameHeight;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
function setUVTransformForIOS() {
  const angle = screen.orientation.type;

  let m = d.mat2x2f.identity();
  if (angle === 'portrait-primary') {
    m = d.mat2x2f(0, -1, 1, 0);
  } else if (angle === 'portrait-secondary') {
    m = d.mat2x2f(0, 1, -1, 0);
  } else if (angle === 'landscape-primary') {
    m = d.mat2x2f(-1, 0, 0, -1);
  }

  uvTransformBuffer.write(m);
}

if (isIOS) {
  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

export const controls = {
  'use extended characters': {
    initial: false,
    onToggleChange: (value: boolean) => charsetExtended.write(value ? 1 : 0),
  },
  'display mode': {
    initial: 'color',
    options: ['color', 'grayscale', 'white'],
    onSelectChange: (value: 'color' | 'grayscale' | 'white') => {
      displayMode.write(displayModes[value]);
    },
  },
  'gamma correction': {
    initial: 1.0,
    min: 0.1,
    max: 10.0,
    step: 0.1,
    onSliderChange: (value: number) => gammaCorrection.write(value),
  },
  'glyph size (px)': {
    initial: 20,
    min: 4,
    max: 32,
    step: 2,
    onSliderChange: (value: number) => glyphSize.write(value),
  },
};

export function onCleanup() {
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
}
