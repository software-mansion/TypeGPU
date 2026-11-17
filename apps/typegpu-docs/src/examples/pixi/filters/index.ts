import { perlin3d } from '@typegpu/noise';
import * as tp from '@typegpu/pixi';
import { Application, Container, type Filter, Graphics, Text } from 'pixi.js';
import { d, std, type TgpuRoot } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

// #region Filters

/** Reads the filter's input, staying inside the part of the texture that holds the picture */
const sampleInside = (uv: d.v2f) => {
  'use gpu';
  const clamp = tp.filterGlobals.$.gfu.uInputClamp;
  return tp.sampleInput(std.clamp(uv, clamp.xy, clamp.zw));
};

const wobbleUniforms = tp.uniforms({ time: d.f32, strength: d.f32 });

// A fragment-only filter: its fragment function receives `uv`, the position in the input texture
const wobble = {
  name: 'wobble',
  uniforms: wobbleUniforms,
  // PixiJS's own filter options pass through
  padding: 24,
  resolution: 'inherit' as const,
  fragment: ({ uv }: { uv: d.v2f }) => {
    'use gpu';
    // `uInputSize` holds the input's size in pixels (xy) and one over it (zw)
    const inputSize = tp.filterGlobals.$.gfu.uInputSize;
    const p = (uv * inputSize.xy) / 120;
    const t = wobbleUniforms.$.time;
    const offset = d.vec2f(perlin3d.sample(d.vec3f(p, t)), perlin3d.sample(d.vec3f(p, t + 10)));
    // The strength is in pixels of the input, turned into a step in texture coordinates
    return sampleInside(uv + offset * wobbleUniforms.$.strength * inputSize.zw);
  },
};

const aberrationUniforms = tp.uniforms({ amount: d.f32 });

// A filter with its own vertex stage. The offset positions only depend on the corners of
// the quad, so they're computed per vertex, and reach the fragment stage interpolated.
const aberration = {
  name: 'aberration',
  uniforms: aberrationUniforms,
  padding: 16,
  resolution: 'inherit' as const,
  vertex: ({ aPosition }: tp.FilterVertexIn) => {
    'use gpu';
    const uv = tp.filterTextureCoord(aPosition);
    const offset = d.vec2f(aberrationUniforms.$.amount, 0) * tp.filterGlobals.$.gfu.uInputSize.zw;
    return {
      $position: tp.filterVertexPosition(aPosition),
      uvRed: uv - offset,
      uv,
      uvBlue: uv + offset,
    };
  },
  // The input's type follows from what the vertex stage returns
  fragment: ({ uvRed, uv, uvBlue }: { uvRed: d.v2f; uv: d.v2f; uvBlue: d.v2f }) => {
    'use gpu';
    const red = sampleInside(uvRed);
    const green = sampleInside(uv);
    const blue = sampleInside(uvBlue);
    return d.vec4f(red.r, green.g, blue.b, std.max(red.a, green.a, blue.a));
  },
};

// A ring that spreads from where the pointer was pressed. A filter's own uniforms can't
// hold an array of these, but a TypeGPU buffer can.
const Ripple = d.struct({ center: d.vec2f, start: d.f32 });
const MAX_RIPPLES = 8;

/** A filter that reads TypeGPU buffers, which only PixiJS's WebGPU renderer can bind */
function createRipples(root: TgpuRoot) {
  const now = root.createUniform(d.f32);
  const ripples = root.createReadonly(
    d.arrayOf(Ripple, MAX_RIPPLES),
    // Ripples that ended long ago
    Array.from({ length: MAX_RIPPLES }, () => ({ center: d.vec2f(), start: -100 })),
  );

  const options = {
    name: 'ripples',
    padding: 24,
    resolution: 'inherit' as const,
    fragment: ({ uv }: { uv: d.v2f }) => {
      'use gpu';
      const gfu = tp.filterGlobals.$.gfu;
      // Where the pixel is on the screen, in the units of the pointer's position
      const position = uv * gfu.uInputSize.xy + gfu.uOutputFrame.xy;

      let offset = d.vec2f();
      for (const ripple of ripples.$) {
        const age = now.$ - ripple.start;
        const fromCenter = position - ripple.center;
        const distance = std.length(fromCenter);
        // A wave packet that travels outwards and fades
        const packet = std.exp(-std.pow((distance - age * 320) / 40, 2));
        const wave = std.sin((distance - age * 320) * 0.15) * packet * std.exp(-age * 1.5);
        offset += (fromCenter / std.max(distance, 1)) * wave * 18;
      }
      return sampleInside(uv + offset * gfu.uInputSize.zw);
    },
  };

  let next = 0;
  return {
    options,
    setTime: (seconds: number) => now.write(seconds),
    add(x: number, y: number, seconds: number) {
      ripples.patch({ [next]: { center: d.vec2f(x, y), start: seconds } });
      next = (next + 1) % MAX_RIPPLES;
    },
  };
}

// #endregion

// #region Scene

type Backend = 'WebGPU' | 'WebGL';

const settings = {
  strength: 14,
  speed: 0.4,
  amount: 3,
  ripples: true,
  wobble: true,
  aberration: true,
};
let time = 0;

async function createScene(backend: Backend) {
  // A canvas keeps the kind of context it was first given, so each renderer gets a fresh one
  const previousCanvas = document.querySelector('canvas') as HTMLCanvasElement;
  const canvas = previousCanvas.cloneNode() as HTMLCanvasElement;
  previousCanvas.replaceWith(canvas);

  const app = new Application();
  await app.init({
    canvas,
    preference: backend === 'WebGPU' ? 'webgpu' : 'webgl',
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    resolution: window.devicePixelRatio,
    antialias: true,
    background: 0x15131f,
  });

  // A filter is generated for the renderer it's given: WGSL for WebGPU, GLSL for WebGL
  const filters = {
    wobble: tp.createFilter(app.renderer, wobble),
    aberration: tp.createFilter(app.renderer, aberration),
  };

  // TypeGPU's buffers live on PixiJS's GPU device, which only the WebGPU renderer has
  const ripples = tp.isWebGPURenderer(app.renderer)
    ? createRipples(tp.getRoot(app.renderer))
    : undefined;
  const rippleFilter: Filter | undefined =
    ripples && tp.createFilter(app.renderer, ripples.options);

  const startTime = performance.now();
  const seconds = () => (performance.now() - startTime) / 1000;
  const onPointerDown = (event: PointerEvent) => {
    ripples?.add(event.offsetX, event.offsetY, seconds());
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  // One to start with, in the middle
  ripples?.add(canvas.clientWidth / 2, canvas.clientHeight / 2, 0);

  const scene = new Container();
  scene.filters = [...(rippleFilter ? [rippleFilter] : []), filters.wobble, filters.aberration];
  scene.filterArea = app.screen;
  app.stage.addChild(scene);

  const dots = new Container();
  const colors = [0xff7a59, 0xffc857, 0x7bdff2, 0xb388ff, 0x6ee7a8, 0xff6fb5];
  for (const [i, color] of colors.entries()) {
    const angle = (i / colors.length) * Math.PI * 2;
    dots.addChild(
      new Graphics().circle(Math.cos(angle) * 150, Math.sin(angle) * 150, 46).fill(color),
    );
  }
  const label = new Text({
    text: 'TypeGPU\n+ PixiJS',
    anchor: 0.5,
    style: { fill: 0xffffff, fontSize: 64, fontWeight: 'bold', align: 'center' },
  });
  scene.addChild(dots, label);

  app.ticker.add((ticker) => {
    const center = { x: app.screen.width / 2, y: app.screen.height / 2 };
    dots.position.set(center.x, center.y);
    label.position.set(center.x, center.y);
    dots.rotation += 0.004 * ticker.deltaTime;

    time += (ticker.deltaMS / 1000) * settings.speed;
    wobbleUniforms.write(filters.wobble, { time });
    // The filter reads the buffer when PixiJS draws, so this write shows in the same frame
    ripples?.setTime(seconds());
  });

  const resizeObserver = new ResizeObserver(() => {
    app.renderer.resize(canvas.clientWidth, canvas.clientHeight);
  });
  resizeObserver.observe(canvas);

  return {
    backend,
    filters,
    rippleFilter,
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      rippleFilter?.destroy();
      filters.wobble.destroy();
      filters.aberration.destroy();
      app.destroy(false, { children: true });
    },
  };
}

function applySettings() {
  wobbleUniforms.write(scene.filters.wobble, { strength: settings.strength });
  aberrationUniforms.write(scene.filters.aberration, { amount: settings.amount });
  if (scene.rippleFilter) {
    scene.rippleFilter.enabled = settings.ripples;
  }
  scene.filters.wobble.enabled = settings.wobble;
  scene.filters.aberration.enabled = settings.aberration;
}

const backends: Backend[] = (await navigator.gpu?.requestAdapter())
  ? ['WebGPU', 'WebGL']
  : ['WebGL'];
let scene = await createScene(backends[0] ?? 'WebGL');

// #endregion

// #region Example controls and cleanup

function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
  settings[key] = value;
  applySettings();
}

let disposed = false;
let switching = Promise.resolve();

function switchBackend(backend: Backend) {
  switching = switching.then(async () => {
    if (disposed || backend === scene.backend) {
      return;
    }
    scene.dispose();
    scene = await createScene(backend);
    applySettings();
  });
}

export const controls = defineControls({
  renderer: { initial: scene.backend, options: backends, onSelectChange: switchBackend },
  'ripples (WebGPU)': {
    initial: settings.ripples,
    onToggleChange: (value) => update('ripples', value),
  },
  wobble: { initial: settings.wobble, onToggleChange: (value) => update('wobble', value) },
  'wobble strength': {
    initial: settings.strength,
    min: 0,
    max: 24,
    step: 0.5,
    onSliderChange: (value) => update('strength', value),
  },
  'wobble speed': {
    initial: settings.speed,
    min: 0,
    max: 2,
    step: 0.05,
    onSliderChange: (value) => update('speed', value),
  },
  aberration: {
    initial: settings.aberration,
    onToggleChange: (value) => update('aberration', value),
  },
  'aberration amount': {
    initial: settings.amount,
    min: 0,
    max: 16,
    step: 0.5,
    onSliderChange: (value) => update('amount', value),
  },
});

export function onCleanup() {
  disposed = true;
  void switching.then(() => scene.dispose());
}

// #endregion
