import tgpu from 'typegpu';
import * as THREE from 'three/webgpu';
import * as tgpu3 from '@typegpu/three';
import * as d from 'typegpu/data';
import * as TSL from 'three/tsl';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// const tgpuMaterial = new tgpu3.TypeGPUMaterial(
//   tgpu.fn([d.vec2f], d.vec4f)((uv) => {
//     return d.vec4f(uv.x, uv.y, 0.5, 1);
//   }),
//   [uv()],
// );

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

// material.colorNode = TSL.uv().x.add(TSL.time).mul(5).fract();

const uv = tgpu3.fromTSL(TSL.uv(), { type: d.vec2f });
material.colorNode = tgpu3.toTSL(
  tgpu.fn([], d.vec4f)(() => {
    return d.vec4f(uv.$, 0.5, 1);
  }),
);

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

renderer.setAnimationLoop(() => {
  mesh.rotation.x += 0.01;
  mesh.rotation.y += 0.01;
  renderer.render(scene, camera);
});

export function onCleanup() {
  renderer.dispose();
  resizeObserver.disconnect();
}
