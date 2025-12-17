// Regression test - previously, this example produced black cubes and errors.
// Now there should be no errors and the cubes should be purple.
import * as t3 from '@typegpu/three';
import * as THREE from 'three/webgpu';
import * as d from 'typegpu/data';

const attractorsPositions = t3.uniformArray([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, -0.5),
  new THREE.Vector3(0, 0.5, 1),
], d.vec3f);
