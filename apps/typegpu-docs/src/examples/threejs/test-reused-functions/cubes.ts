import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import { getColorA, getColorB, getColorC, getColorComplex, getColorDiamond } from './functions.ts';
import { mix } from 'three/tsl';

export function getCubeTwoDifferentFunctions() {
  const material = new THREE.MeshBasicNodeMaterial();

  material.colorNode = mix(t3.toTSL(getColorA), t3.toTSL(getColorB), 0.5);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = -2;
  mesh.position.y = 2;

  return mesh;
}

export function getCubeTwoSameFunctions() {
  const material = new THREE.MeshBasicNodeMaterial();

  material.colorNode = mix(t3.toTSL(getColorA).sub(0.2), t3.toTSL(getColorA), 0.5);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = 2;
  mesh.position.y = 2;

  return mesh;
}

export function getCubeNestedFunctionReference() {
  const material = new THREE.MeshBasicNodeMaterial();

  material.colorNode = mix(t3.toTSL(getColorA), t3.toTSL(getColorComplex), 0.5);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = -2;
  mesh.position.y = -2;

  return mesh;
}

export function getCubeDiamondWithReference() {
  const material = new THREE.MeshBasicNodeMaterial();

  material.colorNode = mix(t3.toTSL(getColorDiamond), t3.toTSL(getColorC), 0.5);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = 2;
  mesh.position.y = -2;

  return mesh;
}
