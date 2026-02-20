// Regression test - previously, this example produced black cubes and errors.
// Now there should be no errors and the cubes should be purple.
import * as THREE from 'three/webgpu';
import {
  getCubeDiamondWithReference,
  getCubeNestedFunctionReference,
  getCubeTwoDifferentFunctions,
  getCubeTwoSameFunctions,
} from './cubes.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ canvas });
await renderer.init();

renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  1,
  0.1,
  1000,
);
camera.position.z = 5;

scene.add(getCubeTwoDifferentFunctions());
scene.add(getCubeTwoSameFunctions());
scene.add(getCubeNestedFunctionReference());
scene.add(getCubeDiamondWithReference());

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
  scene.children.forEach((mesh) => {
    mesh.rotation.x += 0.2 * deltaTime;
    mesh.rotation.y += 0.2 * deltaTime;
  });
  renderer.render(scene, camera);
});

export function onCleanup() {
  observer.disconnect();
  renderer.dispose();
}
