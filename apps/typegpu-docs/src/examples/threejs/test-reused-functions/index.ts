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

scene.add(getCubeTwoDifferentFunctions());
scene.add(getCubeTwoSameFunctions());
scene.add(getCubeNestedFunctionReference());
scene.add(getCubeDiamondWithReference());

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
  scene.children.forEach((mesh) => {
    mesh.rotation.x += 0.2 * deltaTime;
    mesh.rotation.y += 0.2 * deltaTime;
  });
  renderer.render(scene, camera);
});

export function onCleanup() {
  renderer.dispose();
}
