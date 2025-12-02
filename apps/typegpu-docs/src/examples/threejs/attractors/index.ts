/*
 * Based on: https://threejs.org/examples/?q=tsl#webgpu_tsl_compute_attractors_particles
 */

import * as THREE from 'three/webgpu';
import {
  color,
  instancedArray,
  instanceIndex,
  uniform,
  uniformArray,
} from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  TransformControls,
  type TransformControlsMode,
} from 'three/addons/controls/TransformControls.js';

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { fromTSL, toTSL } from '@typegpu/three';
import { randf } from '@typegpu/noise';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasResizeContainer = canvas.parentElement
  ?.parentElement as HTMLDivElement;

const getTargetSize = () => {
  return [
    canvasResizeContainer.clientWidth,
    canvasResizeContainer.clientHeight,
  ] as [number, number];
};

const camera = new THREE.PerspectiveCamera(
  25,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(3, 5, 8);

const scene = new THREE.Scene();

// ambient light

const ambientLight = new THREE.AmbientLight('#ffffff', 0.5);
scene.add(ambientLight);

// directional light

const directionalLight = new THREE.DirectionalLight(
  '#ffffff',
  1.5,
);
directionalLight.position.set(4, 2, 0);
scene.add(directionalLight);

// renderer

const renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setAnimationLoop(animate);
renderer.setClearColor('#000000');

await renderer.init();

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.minDistance = 0.1;
orbitControls.maxDistance = 50;

window.addEventListener('resize', onWindowResize);

// attractors

const attractorsPositions = uniformArray([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, -0.5),
  new THREE.Vector3(0, 0.5, 1),
]);
const attractorsRotationAxes = uniformArray([
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, -0.5).normalize(),
]);
const attractorsLength = uniform(
  attractorsPositions.array.length,
  'uint',
);
const helpersRingGeometry = new THREE.RingGeometry(
  1,
  1.02,
  32,
  1,
  0,
  Math.PI * 1.5,
);
const helpersArrowGeometry = new THREE.ConeGeometry(
  0.1,
  0.4,
  12,
  1,
  false,
);
const helpersMaterial = new THREE.MeshBasicMaterial({
  side: THREE.DoubleSide,
});

const attractorsHelpers: { controls: TransformControls; arrow: THREE.Group }[] =
  [];
for (let i = 0; i < attractorsPositions.array.length; i++) {
  const position = attractorsPositions.array[i] as THREE.Vector3;
  const orientation = attractorsRotationAxes.array[i] as THREE.Vector3;
  const reference = new THREE.Object3D();
  reference.position.copy(position);
  reference.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    orientation,
  );
  scene.add(reference);

  const arrowHelper = new THREE.Group();
  arrowHelper.scale.setScalar(0.325);
  reference.add(arrowHelper);

  const ring = new THREE.Mesh(
    helpersRingGeometry,
    helpersMaterial,
  );
  ring.rotation.x = -Math.PI * 0.5;
  arrowHelper.add(ring);

  const arrow = new THREE.Mesh(
    helpersArrowGeometry,
    helpersMaterial,
  );
  arrow.position.x = 1;
  arrow.position.z = 0.2;
  arrow.rotation.x = Math.PI * 0.5;
  arrowHelper.add(arrow);

  const attractorControls = new TransformControls(
    camera,
    renderer.domElement,
  );

  attractorControls.mode = 'rotate';
  attractorControls.size = 0.5;
  attractorControls.attach(reference);
  attractorControls.enabled = true;
  scene.add(attractorControls.getHelper());

  attractorControls.addEventListener(
    'dragging-changed',
    (event) => {
      orbitControls.enabled = !event.value;
    },
  );

  attractorControls.addEventListener('change', () => {
    position.copy(reference.position);
    orientation.copy(
      new THREE.Vector3(0, 1, 0).applyQuaternion(
        reference.quaternion,
      ),
    );
  });

  attractorsHelpers.push({ controls: attractorControls, arrow: arrowHelper });
}

// particles

const count = 2 ** 18;
const material = new THREE.SpriteNodeMaterial({
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const attractorMass = uniform(Number(`1e${7}`));
const particleGlobalMass = uniform(Number(`1e${4}`));
const timeScale = 1;
const spinningStrength = uniform(2.75);
const maxSpeed = uniform(8);
const gravityConstant = 6.67e-11;
const velocityDamping = uniform(0.1);
const scale = uniform(0.008);
const boundHalfExtent = uniform(8);
const colorA = uniform(color('#5900ff'));
const colorB = uniform(color('#ffa575'));

const positionBuffer = instancedArray(count, 'vec3');
const velocityBuffer = instancedArray(count, 'vec3');

const sphericalToVec3 = (phi: number, theta: number) => {
  'use gpu';
  const sinPhiRadius = std.sin(phi);

  return d.vec3f(
    sinPhiRadius * std.sin(theta),
    std.cos(phi),
    sinPhiRadius * std.cos(theta),
  );
};

// init compute

const comptimeRandom = tgpu['~unstable'].comptime(() => Math.random());

const instanceIndexAccessor = fromTSL(instanceIndex, { type: d.u32 });
const positionBufferAccessor = fromTSL(positionBuffer, {
  type: d.arrayOf(d.vec3f),
});
const velocityBufferAccessor = fromTSL(velocityBuffer, {
  type: d.arrayOf(d.vec3f),
});

const initCompute = toTSL(() => {
  'use gpu';
  randf.seed(instanceIndexAccessor.$ / count + comptimeRandom());

  const basePosition = d.vec3f(randf.sample(), randf.sample(), randf.sample())
    .sub(0.5)
    .mul(d.vec3f(5, 0.2, 5));
  positionBufferAccessor.$[instanceIndexAccessor.$] = d.vec3f(basePosition);

  const phi = randf.sample() * 2 * Math.PI;
  const theta = randf.sample() * 2;
  const baseVelocity = sphericalToVec3(phi, theta).mul(0.05);
  velocityBufferAccessor.$[instanceIndexAccessor.$] = d.vec3f(baseVelocity);
});

const reset = () => renderer.compute(initCompute.compute(count));
reset();

// update compute

const attractorsPositionsAccess = fromTSL(attractorsPositions, {
  type: d.arrayOf(d.vec3f),
});
const attractorsRotationAxesAccess = fromTSL(attractorsRotationAxes, {
  type: d.arrayOf(d.vec3f),
});
const attractorsLengthAccess = fromTSL(attractorsLength, { type: d.u32 });
const particleGlobalMassAccessor = fromTSL(particleGlobalMass, {
  type: d.f32,
});
const attractorMassAccessor = fromTSL(attractorMass, { type: d.f32 });
const maxSpeedAccessor = fromTSL(maxSpeed, { type: d.f32 });
const velocityDampingAccessor = fromTSL(velocityDamping, { type: d.f32 });
const spinningStrengthAccessor = fromTSL(spinningStrength, { type: d.f32 });
const boundHalfExtentAccessor = fromTSL(boundHalfExtent, { type: d.f32 });

const getParticleMassMultiplier = () => {
  'use gpu';
  const instanceIndex = instanceIndexAccessor.$;
  randf.seed(instanceIndex / count + comptimeRandom());
  // in the original example, the values are remapped to [-1/3, 1] instead of [1/4, 1]
  const base = 0.25 + randf.sample() * 3 / 4;
  return base;
};

const getParticleMass = () => {
  'use gpu';
  return getParticleMassMultiplier() * particleGlobalMassAccessor.$;
};

const update = toTSL(() => {
  'use gpu';
  const delta = 1 / 60 * timeScale;
  let position = d.vec3f(positionBufferAccessor.$[instanceIndexAccessor.$]);
  let velocity = d.vec3f(velocityBufferAccessor.$[instanceIndexAccessor.$]);

  // force

  let force = d.vec3f();

  for (let i = d.u32(); i < attractorsLengthAccess.$; i++) {
    const attractorPosition = attractorsPositionsAccess.$[i].xyz;
    const attractorRotationAxis = attractorsRotationAxesAccess.$[i].xyz;

    const toAttractor = attractorPosition.sub(position);
    const distance = std.length(toAttractor);
    const direction = std.normalize(toAttractor);

    // gravity
    const gravityStrength = attractorMassAccessor.$ *
      getParticleMass() *
      gravityConstant /
      (distance ** 2);
    const gravityForce = direction.mul(gravityStrength);
    force = force.add(gravityForce);

    // spinning
    const spinningForce = attractorRotationAxis
      .mul(gravityStrength)
      .mul(spinningStrengthAccessor.$);
    const spinningVelocity = std.cross(spinningForce, toAttractor);
    force = force.add(spinningVelocity);
  }

  // velocity

  velocity = velocity.add(force.mul(delta));
  const speed = std.length(velocity);
  if (speed > maxSpeedAccessor.$) {
    velocity = std.normalize(velocity).mul(maxSpeedAccessor.$);
  }
  velocity = velocity.mul(1 - velocityDampingAccessor.$);

  // position

  position = position.add(velocity.mul(delta));

  // box loop

  const halfHalfExtent = boundHalfExtentAccessor.$ / 2;
  position = std
    .mod(position.add(halfHalfExtent), boundHalfExtentAccessor.$).sub(
      halfHalfExtent,
    );

  positionBufferAccessor.$[instanceIndexAccessor.$] = d.vec3f(position);
  velocityBufferAccessor.$[instanceIndexAccessor.$] = d.vec3f(velocity);
});

const updateCompute = update.compute(count).setName('Update Particles');

// nodes

material.positionNode = positionBuffer.toAttribute();

const colorAAccessor = fromTSL(colorA, { type: d.vec3f });
const colorBAccessor = fromTSL(colorB, { type: d.vec3f });

const velocityBufferAttributeAccessor = fromTSL(velocityBuffer.toAttribute(), {
  type: d.vec4f,
});

material.colorNode = toTSL(() => {
  'use gpu';
  const velocity = velocityBufferAttributeAccessor.$.xyz;
  const speed = std.length(velocity);
  const colorMix = std.smoothstep(0, 0.5, speed / maxSpeedAccessor.$);
  const finalColor = std.mix(colorAAccessor.$, colorBAccessor.$, colorMix);

  return d.vec4f(finalColor, 1);
});

material.scaleNode = toTSL(getParticleMassMultiplier).mul(scale);

// mesh

const geometry = new THREE.PlaneGeometry(1, 1);
const mesh = new THREE.InstancedMesh(geometry, material, count);
scene.add(mesh);

function onWindowResize() {
  const targetSize = getTargetSize();

  camera.aspect = targetSize[0] / targetSize[1];
  camera.updateProjectionMatrix();

  renderer.setSize(...targetSize);
}

async function animate() {
  orbitControls.update();

  const targetSize = getTargetSize();
  const rendererSize = renderer.getSize(new THREE.Vector2());
  if (
    targetSize[0] !== rendererSize.width ||
    targetSize[1] !== rendererSize.height
  ) {
    onWindowResize();
  }

  renderer.compute(updateCompute);
  renderer.render(scene, camera);
}

// #region Example controls and cleanup

export const controls = {
  'Controls Mode': {
    initial: 'translate',
    options: [
      'translate',
      'rotate',
      'none',
    ],
    onSelectChange: (value: string) => {
      for (const { controls } of attractorsHelpers) {
        if (value === 'none') {
          controls.getHelper().visible = false;
          controls.enabled = false;
        } else {
          controls.getHelper().visible = true;
          controls.enabled = true;
          controls.setMode(value as TransformControlsMode);
        }
      }
    },
  },
  'Arrow visible': {
    initial: true,
    onToggleChange: (value: boolean) => {
      for (const { arrow } of attractorsHelpers) {
        arrow.visible = value;
      }
    },
  },
  'Attractor Mass Exponent': {
    initial: 7,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange: (newValue: number) => {
      attractorMass.value = Number(`1e${newValue}`);
    },
  },
  'Particle Global Mass Exponent': {
    initial: 4,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange: (newValue: number) => {
      particleGlobalMass.value = Number(`1e${newValue}`);
    },
  },
  'Max Speed': {
    initial: 8,
    min: 0,
    max: 10,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      maxSpeed.value = newValue;
    },
  },
  'Velocity Damping': {
    initial: 0.1,
    min: 0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (newValue: number) => {
      velocityDamping.value = newValue;
    },
  },
  'Spinning Strength': {
    initial: 2.75,
    min: 0,
    max: 10,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      spinningStrength.value = newValue;
    },
  },
  'Scale': {
    initial: 0.008,
    min: 0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (newValue: number) => {
      scale.value = newValue;
    },
  },
  'Bound Half Extent': {
    initial: 8,
    min: 0,
    max: 20,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      boundHalfExtent.value = newValue;
    },
  },
  'Color A': {
    initial: [colorA.value.r, colorA.value.g, colorA.value.b],
    onColorChange: (newValue: [number, number, number]) => {
      colorA.value.setRGB(newValue[0], newValue[1], newValue[2]);
    },
  },
  'Color B': {
    initial: [colorB.value.r, colorB.value.g, colorB.value.b],
    onColorChange: (newValue: [number, number, number]) => {
      colorB.value.setRGB(newValue[0], newValue[1], newValue[2]);
    },
  },
  'Reset Particles': {
    onButtonClick: reset,
  },
};

// #endregion
