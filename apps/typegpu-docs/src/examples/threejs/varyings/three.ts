import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setPixelRatio(window.devicePixelRatio);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8abbf);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 7, 7);
camera.lookAt(0, 0, 0);

// VARYINGS USAGE

const vNormal = TSL.varying(TSL.vec3(), 'vNormal');

const positionNode = TSL.Fn(() => {
  const pos = TSL.positionLocal.toVar();

  const time = TSL.time.mul(0.5);
  const frequency = TSL.float(3.0);
  const amplitude = TSL.float(0.5);

  const wave = TSL.sin(pos.x.mul(frequency).add(time));

  pos.y.addAssign(wave.mul(amplitude));

  const derivative = TSL.cos(pos.x.mul(frequency).add(time)).mul(amplitude).mul(
    frequency,
  );

  const newNormalLocal = TSL.vec3(derivative.negate(), 1.0, 0.0);

  vNormal.assign(newNormalLocal);

  return pos;
});

const normalNode = TSL.Fn(() => {
  return TSL.transformNormalToView(vNormal).normalize();
});

// END OF VARYINGS USAGE

const material = new THREE.MeshStandardNodeMaterial({
  color: 0x9e0d3b,
  roughness: 0.1,
  metalness: 0.8,
  side: THREE.DoubleSide,
});

material.positionNode = positionNode();
material.normalNode = normalNode();

const geometry = new THREE.PlaneGeometry(4, 4, 100, 100);
geometry.rotateX(-Math.PI / 2);

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const dirLight = new THREE.DirectionalLight(0xffffff, 3);
dirLight.position.set(-7, 10, 0);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x444444));

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  resizeObserver.disconnect();
  renderer.dispose();
}
