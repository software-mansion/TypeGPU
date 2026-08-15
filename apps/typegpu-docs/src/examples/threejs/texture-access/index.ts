import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.FogExp2(0x030712, 0.055);

const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 0.25, 10);

// A tiny color ramp created entirely on the CPU and owned by Three.js.
const colors = [
  0x031b3d, 0x052b5c, 0x06467a, 0x075985, 0x087ea4, 0x0891b2, 0x06b6d4, 0x22d3ee, 0x5eead4,
  0x99f6e4, 0xcffafe, 0x38bdf8,
];
const paletteData = new Uint8Array(colors.length * 4);
for (let i = 0; i < colors.length; i++) {
  const color = colors[i];
  paletteData.set([color >> 16, (color >> 8) & 0xff, color & 0xff, 0xff], i * 4);
}

const paletteTexture = new THREE.DataTexture(paletteData, colors.length, 1, THREE.RGBAFormat);
paletteTexture.colorSpace = THREE.NoColorSpace;
paletteTexture.magFilter = THREE.LinearFilter;
paletteTexture.minFilter = THREE.LinearFilter;
paletteTexture.wrapS = THREE.RepeatWrapping;
paletteTexture.needsUpdate = true;

// The Three.js texture and sampler become typed handles inside TypeGPU shaders.
const palette = t3.fromTSL(paletteTexture, d.texture2d());
const paletteSampler = t3.fromTSL(TSL.sampler(paletteTexture), d.sampler());
const position = t3.fromTSL(TSL.positionLocal, d.vec3f);
const normal = t3.fromTSL(TSL.normalLocal, d.vec3f);

const material = new THREE.MeshStandardNodeMaterial({
  metalness: 0.72,
  roughness: 0.23,
});

material.positionNode = t3.toTSL(() => {
  'use gpu';
  const preTransformedPosition = position.$;
  const wave = std.sin(
    std.dot(preTransformedPosition, d.vec3f(6.5, 4, 5.5) * 0.3) + t3.time.$ * 1.4,
  );
  return preTransformedPosition + normal.$ * wave * 0.055;
});

material.colorNode = t3.toTSL(() => {
  'use gpu';
  const localPosition = position.$;
  const ripple =
    std.sin(std.dot(localPosition, d.vec3f(2.8, -3.4, 4.2)) * 2.2 + t3.time.$ * 0.45) * 0.09;
  const phaseA = std.fract(
    std.dot(localPosition, d.vec3f(0.32, 0.18, 0.27)) + ripple + t3.time.$ * 0.025,
  );
  const phaseB = std.fract(
    std.dot(localPosition, d.vec3f(-0.19, 0.36, 0.24)) - ripple * 0.7 - t3.time.$ * 0.018,
  );

  const flowingColorA = std.textureSample(palette.$, paletteSampler.$, d.vec2f(phaseA, 0.5));
  const flowingColorB = std.textureSample(palette.$, paletteSampler.$, d.vec2f(phaseB, 0.5));
  const weave = std.smoothstep(
    -0.35,
    0.65,
    std.sin(std.dot(localPosition, d.vec3f(5.2, 7.5, -4.4)) + t3.time.$ * 0.18),
  );
  const wovenColor = std.mix(flowingColorA, flowingColorB, weave * 0.42);

  const texelIndex = d.i32(std.floor(phaseA * colors.length));
  const crispAccent = std.textureLoad(palette.$, d.vec2i(texelIndex, 0), 0);
  const thread = std.smoothstep(
    0.4,
    0.5,
    std.abs(std.fract(std.dot(localPosition, d.vec3f(1.8, 2.4, -2.1)) * 2.2 + ripple) - 0.5),
  );

  return std.mix(wovenColor, crispAccent * 1.3, thread * 0.3);
});

const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.35, 0.42, 320, 64, 2, 3), material);
knot.rotation.x = -0.18;
scene.add(knot);

const halo = new THREE.Mesh(
  new THREE.TorusGeometry(3.05, 0.02, 8, 160),
  new THREE.MeshBasicMaterial({ color: 0xffaa22 }),
);
halo.rotation.x = Math.PI * 0.54;
halo.rotation.y = Math.PI * 0.08;
scene.add(halo);

const lightColor = 0xffffff;
scene.add(new THREE.AmbientLight(lightColor, 3.2));

const lightLeft = new THREE.PointLight(lightColor, 18, 12, 2);
lightLeft.position.set(-3.2, 2.4, 3.6);
scene.add(lightLeft);

const lightRight = new THREE.PointLight(lightColor, 18, 12, 2);
lightRight.position.set(3.2, -2.4, 3.6);
scene.add(lightRight);

let pointerX = 0;
let pointerY = 0;
const onPointerMove = (event: PointerEvent) => {
  pointerX = event.clientX / window.innerWidth - 0.5;
  pointerY = event.clientY / window.innerHeight - 0.5;
};
window.addEventListener('pointermove', onPointerMove, { passive: true });

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

void renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;
  knot.rotation.y = seconds * 0.16 + pointerX * 0.3;
  knot.rotation.x = -0.18 + stdlibLerp(knot.rotation.x + 0.18, -pointerY * 0.2, 0.04);
  halo.rotation.z = -seconds * 0.055;
  renderer.render(scene, camera);
});

function stdlibLerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

export function onCleanup() {
  resizeObserver.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  paletteTexture.dispose();
  knot.geometry.dispose();
  material.dispose();
  halo.geometry.dispose();
  halo.material.dispose();
  void renderer.setAnimationLoop(null);
  renderer.dispose();
}
