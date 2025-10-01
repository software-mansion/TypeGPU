// Complex data structure example
import { struct, arrayOf, f32, vec3f, mat4x4f, sizeOf } from 'typegpu/data';

const Transform = struct({
  position: vec3f,
  rotation: vec3f,
  scale: vec3f,
});

const Material = struct({
  diffuse: vec3f,
  specular: vec3f,
  roughness: f32,
  metallic: f32,
});

const Mesh = struct({
  transform: Transform,
  material: Material,
  mvpMatrix: mat4x4f,
});

const MeshArray = arrayOf(Mesh, 100);

console.log('Complex structure size:', sizeOf(MeshArray));