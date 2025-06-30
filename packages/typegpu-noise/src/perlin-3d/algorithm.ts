import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, dot, floor, mix, mul, sub } from 'typegpu/std';
import { randOnUnitSphere, randSeed3 } from '../random.ts';
import { smootherStep } from '../utils.ts';

export const computeJunctionGradient = tgpu.fn([d.vec3i], d.vec3f)((pos) => {
  randSeed3(mul(0.001, d.vec3f(pos)));
  return randOnUnitSphere();
});

export const getJunctionGradientSlot = tgpu.slot(computeJunctionGradient);

const dotProdGrid = tgpu.fn([d.vec3f, d.vec3f], d.f32)((pos, junction) => {
  const relative = sub(pos, junction);
  const gridVector = getJunctionGradientSlot.value(d.vec3i(junction));
  return dot(relative, gridVector);
});

export const sample = tgpu.fn([d.vec3f], d.f32)((pos) => {
  const minJunction = floor(pos);

  const xyz = dotProdGrid(pos, minJunction);
  const xyZ = dotProdGrid(pos, add(minJunction, d.vec3f(0, 0, 1)));
  const xYz = dotProdGrid(pos, add(minJunction, d.vec3f(0, 1, 0)));
  const xYZ = dotProdGrid(pos, add(minJunction, d.vec3f(0, 1, 1)));
  const Xyz = dotProdGrid(pos, add(minJunction, d.vec3f(1, 0, 0)));
  const XyZ = dotProdGrid(pos, add(minJunction, d.vec3f(1, 0, 1)));
  const XYz = dotProdGrid(pos, add(minJunction, d.vec3f(1, 1, 0)));
  const XYZ = dotProdGrid(pos, add(minJunction, d.vec3f(1, 1, 1)));

  const partial = sub(pos, minJunction);

  // Resolving the z-axis into a xy-slice
  const xy = mix(xyz, xyZ, smootherStep(partial.z));
  const xY = mix(xYz, xYZ, smootherStep(partial.z));
  const Xy = mix(Xyz, XyZ, smootherStep(partial.z));
  const XY = mix(XYz, XYZ, smootherStep(partial.z));

  // Merging the y-axis
  const x = mix(xy, xY, smootherStep(partial.y));
  const X = mix(Xy, XY, smootherStep(partial.y));

  return mix(x, X, smootherStep(partial.x));
});
