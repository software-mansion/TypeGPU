import * as THREE from 'three/webgpu';
import {
  color,
  cos,
  float,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  Loop,
  mix,
  mod,
  PI,
  sin,
  uint,
  uniform,
  uniformArray,
  vec3,
  vec4,
} from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

let camera, scene, renderer, controls, updateCompute;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasResizeContainer = canvas.parentElement
  ?.parentElement as HTMLDivElement;

const getTargetSize = () => {
  return [
    canvasResizeContainer.clientWidth,
    canvasResizeContainer.clientHeight,
  ] as [number, number];
};

init();

async function init() {
  camera = new THREE.PerspectiveCamera(
    25,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(3, 5, 8);

  scene = new THREE.Scene();

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

  renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setAnimationLoop(animate);
  renderer.setClearColor('#000000');

  await renderer.init();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

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
  const attractors = [];
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

  for (let i = 0; i < attractorsPositions.array.length; i++) {
    const attractor = {};

    attractor.position = attractorsPositions.array[i];
    attractor.orientation = attractorsRotationAxes.array[i];
    attractor.reference = new THREE.Object3D();
    attractor.reference.position.copy(attractor.position);
    attractor.reference.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      attractor.orientation,
    );
    scene.add(attractor.reference);

    attractor.helper = new THREE.Group();
    attractor.helper.scale.setScalar(0.325);
    attractor.reference.add(attractor.helper);

    attractor.ring = new THREE.Mesh(
      helpersRingGeometry,
      helpersMaterial,
    );
    attractor.ring.rotation.x = -Math.PI * 0.5;
    attractor.helper.add(attractor.ring);

    attractor.arrow = new THREE.Mesh(
      helpersArrowGeometry,
      helpersMaterial,
    );
    attractor.arrow.position.x = 1;
    attractor.arrow.position.z = 0.2;
    attractor.arrow.rotation.x = Math.PI * 0.5;
    attractor.helper.add(attractor.arrow);

    attractor.controls = new TransformControls(
      camera,
      renderer.domElement,
    );
    attractor.controls.mode = 'rotate';
    attractor.controls.size = 0.5;
    attractor.controls.attach(attractor.reference);
    attractor.controls.visible = true;
    attractor.controls.enabled = attractor.controls.visible;
    scene.add(attractor.controls.getHelper());

    attractor.controls.addEventListener(
      'dragging-changed',
      (event) => {
        controls.enabled = !event.value;
      },
    );

    attractor.controls.addEventListener('change', () => {
      attractor.position.copy(attractor.reference.position);
      attractor.orientation.copy(
        new THREE.Vector3(0, 1, 0).applyQuaternion(
          attractor.reference.quaternion,
        ),
      );
    });

    attractors.push(attractor);
  }

  // particles

  const count = Math.pow(2, 18);
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const attractorMass = uniform(Number(`1e${7}`));
  const particleGlobalMass = uniform(Number(`1e${4}`));
  const timeScale = uniform(1);
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

  const sphericalToVec3 = Fn(([phi, theta]) => {
    const sinPhiRadius = sin(phi);

    return vec3(
      sinPhiRadius.mul(sin(theta)),
      cos(phi),
      sinPhiRadius.mul(cos(theta)),
    );
  });

  // init compute

  const init = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    const basePosition = vec3(
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
      hash(instanceIndex.add(uint(Math.random() * 0xffffff))),
    ).sub(0.5).mul(vec3(5, 0.2, 5));
    position.assign(basePosition);

    const phi = hash(
      instanceIndex.add(uint(Math.random() * 0xffffff)),
    ).mul(PI).mul(2);
    const theta = hash(
      instanceIndex.add(uint(Math.random() * 0xffffff)),
    ).mul(PI);
    const baseVelocity = sphericalToVec3(phi, theta).mul(0.05);
    velocity.assign(baseVelocity);
  });

  const initCompute = init().compute(count);

  const reset = () => {
    renderer.compute(initCompute);
  };

  reset();

  // update compute

  const particleMassMultiplier = hash(
    instanceIndex.add(uint(Math.random() * 0xffffff)),
  ).remap(0.25, 1).toVar();
  const particleMass = particleMassMultiplier.mul(
    particleGlobalMass,
  ).toVar();

  const update = Fn(() => {
    // const delta = timerDelta().mul( timeScale ).min( 1 / 30 ).toVar();
    const delta = float(1 / 60).mul(timeScale).toVar(); // uses fixed delta to consistent result
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    // force

    const force = vec3(0).toVar();

    Loop(attractorsLength, ({ i }) => {
      const attractorPosition = attractorsPositions.element(i);
      const attractorRotationAxis = attractorsRotationAxes
        .element(i);
      const toAttractor = attractorPosition.sub(position);
      const distance = toAttractor.length();
      const direction = toAttractor.normalize();

      // gravity
      const gravityStrength = attractorMass.mul(particleMass).mul(
        gravityConstant,
      ).div(distance.pow(2)).toVar();
      const gravityForce = direction.mul(gravityStrength);
      force.addAssign(gravityForce);

      // spinning
      const spinningForce = attractorRotationAxis.mul(
        gravityStrength,
      ).mul(spinningStrength);
      const spinningVelocity = spinningForce.cross(toAttractor);
      force.addAssign(spinningVelocity);
    });

    // velocity

    velocity.addAssign(force.mul(delta));
    const speed = velocity.length();
    If(speed.greaterThan(maxSpeed), () => {
      velocity.assign(velocity.normalize().mul(maxSpeed));
    });
    velocity.mulAssign(velocityDamping.oneMinus());

    // position

    position.addAssign(velocity.mul(delta));

    // box loop

    const halfHalfExtent = boundHalfExtent.div(2).toVar();
    position.assign(
      mod(position.add(halfHalfExtent), boundHalfExtent).sub(
        halfHalfExtent,
      ),
    );
  });
  updateCompute = update().compute(count).setName(
    'Update Particles',
  );

  // nodes

  material.positionNode = positionBuffer.toAttribute();

  material.colorNode = Fn(() => {
    const velocity = velocityBuffer.toAttribute();
    const speed = velocity.length();
    const colorMix = speed.div(maxSpeed).smoothstep(0, 0.5);
    const finalColor = mix(colorA, colorB, colorMix);

    return vec4(finalColor, 1);
  })();

  material.scaleNode = particleMassMultiplier.mul(scale);

  // mesh

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(mesh);
}

function onWindowResize() {
  const targetSize = getTargetSize();

  camera.aspect = targetSize[0] / targetSize[1];
  camera.updateProjectionMatrix();

  renderer.setSize(...targetSize);
}

async function animate() {
  controls.update();

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
