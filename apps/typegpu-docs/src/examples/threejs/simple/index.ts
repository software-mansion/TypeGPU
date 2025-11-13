import * as THREE from 'three/webgpu';
import { time, toTSL, uv } from '@typegpu/three';
import { perlin3d } from '@typegpu/noise';
import * as d from 'typegpu/data';
import { tanh } from 'typegpu/std';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ canvas });
await renderer.init();

renderer.setPixelRatio(window.devicePixelRatio);
let lastWidth = canvas.clientWidth;
let lastHeight = canvas.clientHeight;
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  lastWidth / lastHeight,
  0.1,
  1000,
);
camera.position.z = 5;

const material = new THREE.MeshBasicNodeMaterial();

material.colorNode = toTSL(() => {
  'use gpu';
  const coords = uv.$.mul(2);
  const pattern = perlin3d.sample(d.vec3f(coords, time.$ * 0.2));
  return d.vec4f(tanh(pattern * 5), 0.2, 0.4, 1);
});

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  material,
);
scene.add(mesh);

let prevTime: number | undefined;
renderer.setAnimationLoop((time) => {
  if (canvas.clientWidth !== lastWidth || canvas.clientHeight !== lastHeight) {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    lastWidth = canvas.clientWidth;
    lastHeight = canvas.clientHeight;
  }

  const deltaTime = (time - (prevTime ?? time)) * 0.001;
  prevTime = time;
  mesh.rotation.x += 0.2 * deltaTime;
  mesh.rotation.y += 0.2 * deltaTime;
  renderer.render(scene, camera);
});

export function onCleanup() {
  renderer.dispose();
}
