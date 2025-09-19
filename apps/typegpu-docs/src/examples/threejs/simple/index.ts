import * as THREE from 'three/webgpu';
import { time, toTSL, uv } from '@typegpu/three';
import { perlin3d } from '@typegpu/noise';
import * as d from 'typegpu/data';
import { tanh } from 'typegpu/std';
// import * as TSL from 'three/tsl';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ canvas });
await renderer.init();

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 5;

const material = new THREE.MeshBasicNodeMaterial();

material.colorNode = toTSL(() => {
  'kernel';
  const coords = uv.$.mul(2);
  const pattern = perlin3d.sample(d.vec3f(coords, time.$ * 0.2));
  return d.vec4f(tanh(pattern * 5), 0.2, 0.4, 1);
});

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  material,
);
scene.add(mesh);

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = entry.contentRect.width;
    const height = entry.contentRect.height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
});
resizeObserver.observe(canvas);

let prevTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const deltaTime = (time - (prevTime ?? time)) * 0.001;
  prevTime = time;
  mesh.rotation.x += 0.2 * deltaTime;
  mesh.rotation.y += 0.2 * deltaTime;
  renderer.render(scene, camera);
});

export function onCleanup() {
  renderer.dispose();
  resizeObserver.disconnect();
}
