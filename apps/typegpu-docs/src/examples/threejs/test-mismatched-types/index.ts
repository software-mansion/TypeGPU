import * as t3 from '@typegpu/three';
import { instancedArray, uniform, uniformArray } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { d } from 'typegpu';

// THREE.TSL.struct, array

// no mismatches

t3.fromTSL(uniform(1), d.f32);
t3.fromTSL(uniform(1, 'uint'), d.u32);
t3.fromTSL(uniform(new THREE.Vector3()), d.vec3f);
t3.fromTSL(uniform(new THREE.Color()), d.vec3f);
t3.fromTSL(uniform(new THREE.Matrix3()), d.mat3x3f);

t3.fromTSL(instancedArray(5, 'float'), d.f32);
t3.fromTSL(instancedArray(5, 'vec3'), d.vec3f);
t3.fromTSL(instancedArray(5, 'uvec4'), d.vec4u);

t3.fromTSL(
  uniformArray([
    new THREE.Vector4(-1, 0, 1, 2),
    new THREE.Vector4(-1, 0, 3, 4),
    new THREE.Vector4(-1, 0, 5, 6),
  ]),
  d.vec4f,
);

// mismatches

t3.fromTSL(uniform(1), d.u32);
t3.fromTSL(uniform(new THREE.Vector3()), d.vec2f);
t3.fromTSL(uniform(new THREE.Vector3()), d.vec4f);
t3.fromTSL(uniform(new THREE.Color()), d.vec4f);
t3.fromTSL(uniform(new THREE.Matrix3()), d.u32);

t3.fromTSL(instancedArray(5, 'int'), d.f32);
t3.fromTSL(instancedArray(5, 'vec3'), d.vec4f);
t3.fromTSL(instancedArray(5, 'uvec4'), d.mat2x2f);

t3.fromTSL(uniformArray([1, 2, 3, 4, 5], 'float'), d.f32); // !!
t3.fromTSL(
  uniformArray([
    new THREE.Vector2(1, 2),
    new THREE.Vector2(3, 4),
    new THREE.Vector2(5, 6),
  ]),
  d.vec2f,
); // !!
t3.fromTSL(
  uniformArray([
    new THREE.Vector3(0, 1, 2),
    new THREE.Vector3(0, 3, 4),
    new THREE.Vector3(0, 5, 6),
  ]),
  d.vec3f,
); // !!
