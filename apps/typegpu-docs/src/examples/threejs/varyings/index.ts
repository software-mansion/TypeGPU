import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as t3 from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setPixelRatio(window.devicePixelRatio);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8abbf);

const camera = new THREE.PerspectiveCamera(
  45,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  100,
);
camera.position.set(0, 7, 7);
camera.lookAt(0, 0, 0);

const vNormal = TSL.varying(TSL.vec3(), 'vNormal');
const vNormalAccessor = t3.fromTSL(vNormal, d.vec3f);
const posAccessor = t3.fromTSL(TSL.positionLocal, d.vec3f);

const updateNormal = (newNormal: d.v3f) => {
  'use gpu';
  vNormalAccessor.$.x = newNormal.x;
  vNormalAccessor.$.y = newNormal.y;
  vNormalAccessor.$.z = newNormal.z;
};

const positionNode = t3.toTSL(() => {
  'use gpu';
  const frequency = d.f32(3.0);
  const amplitude = 0.5;
  const wave = std.sin(posAccessor.$.x * frequency + t3.time.$);

  posAccessor.$.y += wave * amplitude;

  const derivative = std.cos(posAccessor.$.x * frequency + t3.time.$) *
    amplitude * frequency;

  const newNormalLocal = d.vec3f(-derivative, 1.0, 0);

  updateNormal(newNormalLocal);

  return d.vec3f(posAccessor.$);
});

const transformedNormalAccessor = t3.fromTSL(
  TSL.transformNormalToView(vNormal),
  d.vec3f,
);

const normalNode = t3.toTSL(() => {
  'use gpu';
  return std.normalize(transformedNormalAccessor.$);
});

const material = new THREE.MeshStandardNodeMaterial({
  color: 0x9e0d3b,
  roughness: 0.1,
  metalness: 0.8,
  side: THREE.DoubleSide,
});

material.positionNode = positionNode;
material.normalNode = normalNode;

const geometry = new THREE.PlaneGeometry(4, 4, 100, 100);
geometry.rotateX(-Math.PI / 2);

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const dirLight = new THREE.DirectionalLight(0xffffff, 3);
dirLight.position.set(-7, 10, 0);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x444444));

void renderer.setAnimationLoop(() => {
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
