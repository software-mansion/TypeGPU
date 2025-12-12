import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import { getColorA, getColorB } from './functions';
import { mix } from 'three/tsl';

export function getCubeTwoDifferentFunctions() {
  const material = new THREE.MeshBasicNodeMaterial();

  material.colorNode = mix(t3.toTSL(getColorA), t3.toTSL(getColorB), 0.5);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
  );
  mesh.position.x = -2;
  mesh.position.y = 2;

  return mesh;
}
