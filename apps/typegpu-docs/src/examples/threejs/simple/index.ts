import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as t3 from '@typegpu/three';
import { perlin3d } from '@typegpu/noise';
import { d, std } from 'typegpu';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
await renderer.init();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.position.z = 5;

const material = new THREE.MeshBasicNodeMaterial();

material.colorNode = t3.toTSL(() => {
  'use gpu';
  const coords = t3.uv().$ * 2;
  const pattern = perlin3d.sample(d.vec3f(coords, t3.time.$ * 0.2));
  return d.vec4f(std.tanh(pattern * 5), 0.2, 0.4, 1);
});

// Undulating vertices
const positionAttrib = t3.fromTSL(TSL.attribute('position', 'vec3'), d.vec3f);
material.positionNode = t3.toTSL(() => {
  'use gpu';
  const localPos = positionAttrib.$;
  const t = t3.time.$;
  const patternX = perlin3d.sample(localPos + d.vec3f(t, 0, 0));
  const patternY = perlin3d.sample(localPos + d.vec3f(t, 0, 1));
  const patternZ = perlin3d.sample(localPos + d.vec3f(t, 0, 2));
  return localPos + d.vec3f(patternX, patternY, patternZ) * 0.5;
});

const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
scene.add(mesh);

const onResize: ResizeObserverCallback = (entries) => {
  const size = entries[0]?.devicePixelContentBoxSize[0];
  if (size) {
    canvas.width = size.inlineSize;
    canvas.height = size.blockSize;
    renderer.setSize(size.inlineSize, size.blockSize, false);
    camera.aspect = size.inlineSize / size.blockSize;
    camera.updateProjectionMatrix();
  }
};

const observer = new ResizeObserver(onResize);
observer.observe(canvas);

let prevTime: number | undefined;
void renderer.setAnimationLoop((time) => {
  const deltaTime = (time - (prevTime ?? time)) * 0.001;
  prevTime = time;
  mesh.rotation.x += 0.2 * deltaTime;
  mesh.rotation.y += 0.2 * deltaTime;
  renderer.render(scene, camera);
});

export function onCleanup() {
  observer.disconnect();
  renderer.dispose();
}
