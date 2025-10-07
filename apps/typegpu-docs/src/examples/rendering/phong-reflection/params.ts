import * as d from 'typegpu/data';
import { ExampleControls } from './schemas';

export const backgroundColor = d.vec3f(145, 218, 231).div(255);

export const initialControls = ExampleControls({
  lightColor: d.vec3f(1, 0.7, 0),
  lightDirection: d.vec3f(0, 7, -7),
  ambientColor: d.vec3f(0.8, 0.8, 0.1),
  ambientStrength: 0.5,
  specularExponent: 8,
});
