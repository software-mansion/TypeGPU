import * as THREE from 'three';
import { d } from 'typegpu';

const v = (x: number, y: number, z: number) => d.vec4f(x, y, z, 1);

export function getCapsuleVertices(radius: number, height: number): [d.v4f[], Uint16Array] {
  const geometry = new THREE.CapsuleGeometry(radius, height - 2 * radius, 8, 16);
  const positionBuffer = geometry.attributes.position.array;
  const result = [];
  for (let i = 0; i < positionBuffer.length; i += 3) {
    result.push(v(positionBuffer[i], positionBuffer[i + 1], positionBuffer[i + 2]));
  }
  return [result, geometry.index?.array as Uint16Array];
}
