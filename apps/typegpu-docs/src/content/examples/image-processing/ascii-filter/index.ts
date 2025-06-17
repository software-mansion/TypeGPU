import tgpu, {
  type Render,
  type Sampled,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();
const device = root.device;

const layout = tgpu.bindGroupLayout({
  inputTexture: { texture: 'float' },
});

const useExtendedCharacters = root['~unstable'].createUniform(d.u32);
const displayModeBuffer = root['~unstable'].createUniform(d.u32);
const gammaCorrectionBuffer = root['~unstable'].createUniform(d.f32);

const shaderSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const characterFn = tgpu['~unstable'].fn([d.u32, d.vec2f], d.f32)((n, p) => {
  const pos = std.floor(std.add(std.mul(p, d.vec2f(-4.0, 4.0)), 2.5));
  if (std.clamp(pos.x, 0.0, 4.0) === pos.x) {
    if (std.clamp(pos.y, 0.0, 4.0) === pos.y) {
      const a = d.u32(std.add(pos.x, std.mul(5.0, pos.y)));
      if ((n >> a) & 1) {
        return 1.0;
      }
    }
  }
  return 0.0;
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: std.mul(0.5, pos[input.vertexIndex]),
  };
});

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})((input) => {
  // Fix the y-axis flip and offset issues
  const correctedUV = d.vec2f(input.uv.x + 0.5, 1.0 - (input.uv.y + 0.5));

  const textureSize = d.vec2f(std.textureDimensions(layout.$.inputTexture));
  const pix = std.mul(correctedUV, textureSize);

  const blockCoord = std.div(
    std.mul(std.floor(std.div(pix, 8.0)), 8.0),
    textureSize,
  );
  const color = std.textureSample(
    layout.bound.inputTexture,
    shaderSampler,
    blockCoord,
  );

  const rawGray = 0.3 * color.x + 0.59 * color.y + 0.11 * color.z;
  const gray = std.pow(rawGray, gammaCorrectionBuffer.value);

  let n = d.u32(4096);
  if (useExtendedCharacters.value === 0) {
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

  const p = d.vec2f(((pix.x / 4.0) % 2.0) - 1.0, ((pix.y / 4.0) % 2.0) - 1.0);

  const charValue = characterFn(n, p);

  const colorMode = displayModeBuffer.value;
  if (colorMode === 0) {
    // Color mode
    return d.vec4f(std.mul(color, charValue).xyz, 1.0);
  }
  if (colorMode === 1) {
    // Grayscale mode
    return d.vec4f(std.mul(d.vec3f(gray), charValue), 1.0);
  }
  // White mode
  return d.vec4f(std.mul(d.vec3f(1), charValue), 1.0);
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

const pipeline = root['~unstable'].withVertex(fullScreenTriangle, {})
  .withFragment(fragmentFn, { format: presentationFormat })
  .createPipeline();

function resizeVideo() {
  if (video.videoHeight === 0) {
    return;
  }

  const aspectRatio = video.videoWidth / video.videoHeight;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
}

const videoSizeObserver = new ResizeObserver(resizeVideo);
videoSizeObserver.observe(video);
video.addEventListener('resize', resizeVideo);

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
}

let renderTexture:
  | (
    & TgpuTexture<{
      size: [number, number];
      format: 'rgba8unorm' | 'bgra8unorm';
    }>
    & Sampled
    & Render
  )
  | undefined;

let bindGroup:
  | TgpuBindGroup<{
    inputTexture: {
      texture: 'float';
    };
  }>
  | undefined;

function run() {
  if (!(video.currentTime > 0)) {
    requestAnimationFrame(run);
    return;
  }

  renderTexture ??= root['~unstable'].createTexture({
    size: [video.videoWidth, video.videoHeight],
    format: presentationFormat as 'rgba8unorm' | 'bgra8unorm',
  }).$usage('render', 'sampled');

  bindGroup ??= root.createBindGroup(layout, {
    inputTexture: renderTexture,
  });

  try {
    device.queue.copyExternalImageToTexture(
      { source: video },
      { texture: root.unwrap(renderTexture) },
      [video.videoWidth, video.videoHeight],
    );
  } catch (error) {
    console.error('Failed to copy video frame to texture:', error);
    requestAnimationFrame(run);
    return;
  }

  pipeline.withColorAttachment({
    loadOp: 'clear',
    storeOp: 'store',
    view: context.getCurrentTexture().createView(),
  }).with(layout, bindGroup).draw(3);

  spinner.style.display = 'none';
  requestAnimationFrame(run);
}
requestAnimationFrame(run);

let displayMode: 'color' | 'grayscale' | 'white' = 'color';

export const controls = {
  'use extended characters': {
    initial: false,
    onToggleChange: (value: boolean) =>
      useExtendedCharacters.write(value ? 1 : 0),
  },
  'display mode': {
    initial: displayMode,
    options: ['color', 'grayscale', 'white'],
    onSelectChange: (value: 'color' | 'grayscale' | 'white') => {
      displayMode = value;
      const modeValue = value === 'color' ? 0 : value === 'grayscale' ? 1 : 2;
      displayModeBuffer.write(modeValue);
    },
  },
  'gamma correction': {
    initial: 1.0,
    min: 0.1,
    max: 3.0,
    step: 0.1,
    onSliderChange: (value: number) => gammaCorrectionBuffer.write(value),
  },
};

export function onCleanup() {
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
  videoSizeObserver.disconnect();
}
