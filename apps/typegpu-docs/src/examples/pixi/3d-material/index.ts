import {
  DirectionalLight,
  Material3D,
  Mesh3D,
  PlaneGeometry,
  SphereGeometry,
  srgbToLinear,
  View3D,
} from '@pixi/3d';
import { OrbitCamera } from '@pixi/3d/extras';
import { perlin3d } from '@typegpu/noise';
import * as p3d from '@typegpu/pixi/3d';
import { Application } from 'pixi.js';
import { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

// #region Material

// Each field becomes a value of the material, set with `blobUniforms.write(material, ...)`
const blobUniforms = p3d.uniforms({
  amplitude: d.f32,
  frequency: d.f32,
  speed: d.f32,
  valleyColor: d.vec3f,
  peakColor: d.vec3f,
});

/** Animated Perlin noise on the unit sphere, roughly between -0.5 and 0.5. Both stages call it. */
const noise = (direction: d.v3f) => {
  'use gpu';
  const drift = d.vec3f(0, 1, 0.5) * p3d.time.$ * blobUniforms.$.speed;
  return perlin3d.sample(direction * blobUniforms.$.frequency + drift);
};

const surfacePoint = (direction: d.v3f) => {
  'use gpu';
  return direction * (1 + noise(direction) * blobUniforms.$.amplitude);
};

// A shader bit fills slots of PixiJS 3D's own material shader. The same functions
// are generated as WGSL for the WebGPU renderer and as GLSL for the WebGL one.
const blobBit = p3d.shaderBit({
  name: 'noiseBlob',
  uniforms: blobUniforms,
  vertex: {
    // Runs before the mesh's transform, on the vertex in the mesh's own space
    beforeTransform: () => {
      'use gpu';
      const direction = std.normalize(p3d.vertex.position.$.xyz);
      // Two directions along the surface, to find the normal of the displaced surface
      const helper = std.select(d.vec3f(0, 1, 0), d.vec3f(1, 0, 0), std.abs(direction.y) > 0.99);
      const tangent = std.normalize(std.cross(direction, helper));
      const bitangent = std.cross(direction, tangent);

      const point = surfacePoint(direction);
      const alongTangent = surfacePoint(std.normalize(direction + tangent * 0.01));
      const alongBitangent = surfacePoint(std.normalize(direction + bitangent * 0.01));

      p3d.vertex.position.$ = d.vec4f(point, 1);
      p3d.vertex.normal.$ = std.normalize(std.cross(alongTangent - point, alongBitangent - point));
    },
  },
  fragment: {
    // Runs before lighting. Lit materials work in linear light, so the colours are linear.
    material: () => {
      'use gpu';
      // The blob sits at the origin, unscaled and unrotated, so its world position
      // points in the same direction as the vertex it came from.
      const direction = std.normalize(p3d.fragment.worldPosition.$);
      const peak = std.smoothstep(-0.3, 0.3, noise(direction));

      p3d.fragment.albedo.$ = std.mix(blobUniforms.$.valleyColor, blobUniforms.$.peakColor, peak);
      p3d.fragment.roughness.$ = std.mix(0.8, 0.25, peak);
    },
  },
});

// #endregion

// #region Post effect

const lensUniforms = p3d.uniforms({ aberration: d.f32, vignette: d.f32 });

// A post effect class: chromatic aberration and a vignette, run on the tone-mapped picture
const LensEffect = p3d.postEffect({
  stage: 'afterToneMapping',
  uniforms: lensUniforms,
  effect: (uv) => {
    'use gpu';
    const fromCenter = uv - 0.5;
    const offset = fromCenter * std.length(fromCenter) * lensUniforms.$.aberration;
    const red = p3d.sampleColor(uv + offset);
    const center = p3d.sampleColor(uv);
    const blue = p3d.sampleColor(uv - offset);

    const edge = std.smoothstep(0.25, 0.75, std.length(fromCenter));
    const color = d.vec3f(red.r, center.g, blue.b) * (1 - edge * lensUniforms.$.vignette);
    return d.vec4f(color, center.a);
  },
});

// #endregion

// #region Scene

type Backend = 'WebGPU' | 'WebGL';

async function createScene(backend: Backend) {
  // A canvas keeps the kind of context it was first given, so each renderer gets a fresh one
  const previousCanvas = document.querySelector('canvas') as HTMLCanvasElement;
  const canvas = previousCanvas.cloneNode() as HTMLCanvasElement;
  previousCanvas.replaceWith(canvas);
  // Zooming with the wheel shouldn't scroll the page
  canvas.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });

  const app = new Application();
  await app.init({
    canvas,
    preference: backend === 'WebGPU' ? 'webgpu' : 'webgl',
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    resolution: window.devicePixelRatio,
    antialias: true,
  });

  const lens = new LensEffect();
  const view3d = new View3D({
    autoResize: true,
    environment: { skyColor: 0xb9c6ff, groundColor: 0x3b2f4a, intensity: 0.7 },
    // The floor fades into the background, so it has no visible edge
    background: 0x15131f,
    fog: { color: 0x15131f, near: 5, far: 14 },
    passes: [lens],
  });
  app.stage.addChild(view3d);

  const sun = new DirectionalLight({ color: 0xfff1dc, intensity: 3 });
  sun.position.set(-4, 3, 3);
  view3d.root.addChild(sun);
  sun.lookAt({ x: 0, y: 0, z: 0 });

  const blobMaterial = new Material3D({ extraBits: [blobBit] });
  // Shadows don't run a shader bit's vertex code, so a shadow would show the plain sphere
  const blob = new Mesh3D({
    geometry: new SphereGeometry({ radius: 1, widthSegments: 160, heightSegments: 120 }),
    material: blobMaterial,
    castShadow: false,
  });

  const floor = new Mesh3D({
    geometry: new PlaneGeometry({ width: 40, height: 40 }),
    material: new Material3D({ baseColor: 0x2b2838, roughness: 0.9 }),
    position: { x: 0, y: -1.5, z: 0 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
  });
  view3d.root.addChild(blob, floor);

  view3d.camera.position.set(0, 0.8, 3.8);
  const orbit = new OrbitCamera({
    view: view3d,
    target: { x: 0, y: 0, z: 0 },
    enableDamping: true,
    minDistance: 2.5,
    maxDistance: 10,
  });

  const resizeObserver = new ResizeObserver(() => {
    app.renderer.resize(canvas.clientWidth, canvas.clientHeight);
  });
  resizeObserver.observe(canvas);

  return {
    backend,
    blobMaterial,
    lens,
    dispose() {
      resizeObserver.disconnect();
      orbit.destroy();
      lens.destroy();
      app.destroy(false, { children: true });
    },
  };
}

// On WebGPU, PixiJS 3D needs the 'indirect-first-instance' feature. Without it, `app.init`
// throws instead of falling back to WebGL, so the example checks first.
const adapter = await navigator.gpu?.requestAdapter();
const backends: Backend[] = adapter?.features.has('indirect-first-instance')
  ? ['WebGPU', 'WebGL']
  : ['WebGL'];

let scene = await createScene(backends[0] ?? 'WebGL');

// #endregion

// #region Example controls and cleanup

const settings = {
  amplitude: 0.5,
  frequency: 1.8,
  speed: 0.3,
  valleyColor: d.vec3f(0.16, 0.12, 0.5),
  peakColor: d.vec3f(1, 0.6, 0.25),
  lens: true,
  aberration: 0.04,
  vignette: 0.6,
};

/** The colour pickers give sRGB colours, and the material works in linear light */
const toLinear = (color: d.v3f) =>
  d.vec3f(srgbToLinear(color.x), srgbToLinear(color.y), srgbToLinear(color.z));

function applySettings() {
  blobUniforms.write(scene.blobMaterial, {
    amplitude: settings.amplitude,
    frequency: settings.frequency,
    speed: settings.speed,
    valleyColor: toLinear(settings.valleyColor),
    peakColor: toLinear(settings.peakColor),
  });
  lensUniforms.write(scene.lens, {
    aberration: settings.aberration,
    vignette: settings.vignette,
  });
  scene.lens.enabled = settings.lens;
}

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
  renderer: {
    initial: scene.backend,
    options: backends,
    onSelectChange: switchBackend,
  },
  amplitude: {
    initial: settings.amplitude,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => update('amplitude', value),
  },
  frequency: {
    initial: settings.frequency,
    min: 0.5,
    max: 5,
    step: 0.1,
    onSliderChange: (value) => update('frequency', value),
  },
  speed: {
    initial: settings.speed,
    min: 0,
    max: 2,
    step: 0.05,
    onSliderChange: (value) => update('speed', value),
  },
  'valley color': {
    initial: settings.valleyColor,
    onColorChange: (value) => update('valleyColor', value),
  },
  'peak color': {
    initial: settings.peakColor,
    onColorChange: (value) => update('peakColor', value),
  },
  'lens effect': {
    initial: settings.lens,
    onToggleChange: (value) => update('lens', value),
  },
  aberration: {
    initial: settings.aberration,
    min: 0,
    max: 0.15,
    step: 0.005,
    onSliderChange: (value) => update('aberration', value),
  },
  vignette: {
    initial: settings.vignette,
    min: 0,
    max: 1,
    step: 0.05,
    onSliderChange: (value) => update('vignette', value),
  },
});

export function onCleanup() {
  disposed = true;
  void switching.then(() => scene.dispose());
}

// #endregion
