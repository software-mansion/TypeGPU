/*
 * Based on: https://threejs.org/examples/?q=tsl#webgpu_tsl_compute_attractors_particles
 */

import { randf } from '@typegpu/noise';
import * as t3 from '@typegpu/three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { color, uniform } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const scene = new THREE.Scene();

// camera

const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
camera.position.set(3, 5, 8);

// ambient light

const ambientLight = new THREE.AmbientLight('#ffffff', 0.5);
scene.add(ambientLight);

// directional light

const directionalLight = new THREE.DirectionalLight('#ffffff', 1.5);
directionalLight.position.set(4, 2, 0);
scene.add(directionalLight);

// renderer

const renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
renderer.setPixelRatio(window.devicePixelRatio);
void renderer.setAnimationLoop(animate);
renderer.setClearColor('#000000');

await renderer.init();

// attractor controls

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.minDistance = 0.1;
orbitControls.maxDistance = 50;

// attractors

const attractorsPositions = t3.uniformArray(
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, -0.5), new THREE.Vector3(0, 0.5, 1)],
  d.vec4f,
);
const attractorsRotationAxes = t3.uniformArray(
  [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, -0.5).normalize(),
  ],
  d.vec4f,
);
const attractorsLength = t3.uniform(attractorsPositions.node.array.length, d.u32);
const helpersRingGeometry = new THREE.RingGeometry(1, 1.02, 32, 1, 0, Math.PI * 1.5);
const helpersArrowGeometry = new THREE.ConeGeometry(0.1, 0.4, 12, 1, false);
const helpersMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

const attractorsHelpers: { controls: TransformControls; arrow: THREE.Group }[] = [];
for (let i = 0; i < attractorsPositions.node.array.length; i++) {
  const position = attractorsPositions.node.array[i] as THREE.Vector3;
  const orientation = attractorsRotationAxes.node.array[i] as THREE.Vector3;
  const reference = new THREE.Object3D();
  reference.position.copy(position);
  reference.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), orientation);
  scene.add(reference);

  const arrowHelper = new THREE.Group();
  arrowHelper.scale.setScalar(0.325);
  reference.add(arrowHelper);

  const ring = new THREE.Mesh(helpersRingGeometry, helpersMaterial);
  ring.rotation.x = -Math.PI * 0.5;
  arrowHelper.add(ring);

  const arrow = new THREE.Mesh(helpersArrowGeometry, helpersMaterial);
  arrow.position.x = 1;
  arrow.position.z = 0.2;
  arrow.rotation.x = Math.PI * 0.5;
  arrowHelper.add(arrow);

  const attractorControls = new TransformControls(camera, renderer.domElement);

  attractorControls.mode = 'translate';
  attractorControls.size = 0.5;
  attractorControls.attach(reference);
  attractorControls.enabled = true;
  scene.add(attractorControls.getHelper());

  attractorControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
  });

  attractorControls.addEventListener('change', () => {
    position.copy(reference.position);
    orientation.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(reference.quaternion));
  });

  attractorsHelpers.push({ controls: attractorControls, arrow: arrowHelper });
}

// particles

const count = 2 ** 18;
const material = new THREE.SpriteNodeMaterial({
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const attractorMass = t3.uniform(1e7, d.f32);
const particleGlobalMass = t3.uniform(1e4, d.f32);
const spinningStrength = t3.uniform(2.75, d.f32);
const maxSpeed = t3.uniform(8, d.f32);
const gravityConstant = 6.67e-11;
const velocityDamping = t3.uniform(0.1, d.f32);
const scale = uniform(0.008);
const boundHalfExtent = t3.uniform(8, d.f32);
const colorA = t3.uniform(color('#5900ff'), d.vec3f);
const colorB = t3.uniform(color('#ffa575'), d.vec3f);

const positionBuffer = t3.instancedArray(count, d.vec3f);
const velocityBuffer = t3.instancedArray(count, d.vec3f);

// typegpu accessors

const seed = Math.random();

const velocityBufferAttributeTA = t3.fromTSL(velocityBuffer.node.toAttribute(), d.vec3f);

// init compute

const sphericalToVec3 = (phi: number, theta: number) => {
  'use gpu';
  const sinPhiRadius = std.sin(phi);

  return d.vec3f(sinPhiRadius * std.sin(theta), std.cos(phi), sinPhiRadius * std.cos(theta));
};

const initCompute = t3.toTSL(() => {
  'use gpu';
  const instanceIndex = t3.instanceIndex.$;
  randf.seed(instanceIndex / count + seed);

  const basePosition = (randf.inUnitCube() - 0.5) * d.vec3f(5, 0.2, 5);
  positionBuffer.$[instanceIndex] = d.vec3f(basePosition);

  const phi = randf.sample() * 2 * Math.PI;
  const theta = randf.sample() * 2;
  const baseVelocity = sphericalToVec3(phi, theta) * 0.05;
  velocityBuffer.$[instanceIndex] = d.vec3f(baseVelocity);
});

const reset = () => renderer.compute(initCompute.compute(count));
void reset();

// update compute

const getParticleMassMultiplier = () => {
  'use gpu';
  randf.seed(t3.instanceIndex.$ / count + seed);
  // in the original example, the values are remapped to [-1/3, 1] instead of [1/4, 1]
  const base = 0.25 + (randf.sample() * 3) / 4;
  return base;
};

const getParticleMass = () => {
  'use gpu';
  return getParticleMassMultiplier() * particleGlobalMass.$;
};

const update = t3.toTSL(() => {
  'use gpu';
  const delta = 1 / 60;
  let position = d.vec3f(positionBuffer.$[t3.instanceIndex.$]);
  let velocity = d.vec3f(velocityBuffer.$[t3.instanceIndex.$]);

  // force
  let force = d.vec3f();

  for (let i = d.u32(); i < attractorsLength.$; i++) {
    const attractorPosition = attractorsPositions.$[i].xyz;
    const attractorRotationAxis = attractorsRotationAxes.$[i].xyz;

    const toAttractor = attractorPosition - position;
    const distance = std.length(toAttractor);
    const direction = std.normalize(toAttractor);

    // gravity
    const gravityStrength = (attractorMass.$ * getParticleMass() * gravityConstant) / distance ** 2;
    const gravityForce = direction * gravityStrength;
    force += gravityForce;

    // spinning
    const spinningForce = attractorRotationAxis * gravityStrength * spinningStrength.$;
    const spinningVelocity = std.cross(spinningForce, toAttractor);
    force += spinningVelocity;
  }

  // velocity
  velocity += force * delta;
  const speed = std.length(velocity);
  if (speed > maxSpeed.$) {
    velocity = std.normalize(velocity) * maxSpeed.$;
  }
  velocity *= 1 - velocityDamping.$;

  // position
  position += velocity * delta;

  // box loop
  const halfHalfExtent = boundHalfExtent.$ / 2;
  position = std.mod(position + halfHalfExtent, boundHalfExtent.$) - halfHalfExtent;

  positionBuffer.$[t3.instanceIndex.$] = d.vec3f(position);
  velocityBuffer.$[t3.instanceIndex.$] = d.vec3f(velocity);
});

const updateCompute = update.compute(count).setName('Update Particles');

// nodes

material.positionNode = positionBuffer.node.toAttribute();

material.colorNode = t3.toTSL(() => {
  'use gpu';
  const velocity = velocityBufferAttributeTA.$;
  const speed = std.length(velocity);
  const colorMix = std.smoothstep(0, 0.5, speed / maxSpeed.$);
  const finalColor = std.mix(colorA.$, colorB.$, colorMix);

  return d.vec4f(finalColor, 1);
});

material.scaleNode = t3.toTSL(getParticleMassMultiplier).mul(scale);

// mesh

const geometry = new THREE.PlaneGeometry(1, 1);
const mesh = new THREE.InstancedMesh(geometry, material, count);
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

async function animate() {
  orbitControls.update();
  void renderer.compute(updateCompute);
  renderer.render(scene, camera);
}

// #region Example controls and cleanup

export const controls = defineControls({
  'Controls Mode': {
    initial: 'translate',
    options: ['translate', 'rotate', 'none'],
    onSelectChange: (value) => {
      for (const { controls } of attractorsHelpers) {
        if (value === 'none') {
          controls.getHelper().visible = false;
          controls.enabled = false;
        } else {
          controls.getHelper().visible = true;
          controls.enabled = true;
          controls.setMode(value);
        }
      }
    },
  },
  'Arrow visible': {
    initial: true,
    onToggleChange: (value) => {
      for (const { arrow } of attractorsHelpers) {
        arrow.visible = value;
      }
    },
  },
  'Attractor Mass Exponent': {
    initial: 7,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange: (newValue) => {
      attractorMass.node.value = Number(`1e${newValue}`);
    },
  },
  'Particle Global Mass Exponent': {
    initial: 4,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange: (newValue) => {
      particleGlobalMass.node.value = Number(`1e${newValue}`);
    },
  },
  'Max Speed': {
    initial: 8,
    min: 0,
    max: 10,
    step: 0.01,
    onSliderChange: (newValue) => {
      maxSpeed.node.value = newValue;
    },
  },
  'Velocity Damping': {
    initial: 0.1,
    min: 0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (newValue) => {
      velocityDamping.node.value = newValue;
    },
  },
  'Spinning Strength': {
    initial: 2.75,
    min: 0,
    max: 10,
    step: 0.01,
    onSliderChange: (newValue) => {
      spinningStrength.node.value = newValue;
    },
  },
  Scale: {
    initial: 0.008,
    min: 0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (newValue) => {
      scale.value = newValue;
    },
  },
  'Bound Half Extent': {
    initial: 8,
    min: 0,
    max: 20,
    step: 0.01,
    onSliderChange: (newValue) => {
      boundHalfExtent.node.value = newValue;
    },
  },
  'Color A': {
    initial: d.vec3f(colorA.node.value.r, colorA.node.value.g, colorA.node.value.b),
    onColorChange: (newValue) => {
      colorA.node.value.setRGB(newValue[0], newValue[1], newValue[2]);
    },
  },
  'Color B': {
    initial: d.vec3f(colorB.node.value.r, colorB.node.value.g, colorB.node.value.b),
    onColorChange: (newValue) => {
      colorB.node.value.setRGB(newValue[0], newValue[1], newValue[2]);
    },
  },
  'Reset Particles': {
    onButtonClick: reset,
  },
});

export function onCleanup() {
  observer.disconnect();
  renderer.dispose();
}

// #endregion
