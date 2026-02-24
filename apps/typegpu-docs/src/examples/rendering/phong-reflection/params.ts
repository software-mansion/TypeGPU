import { d } from 'typegpu';
import { ExampleControls } from './schemas.ts';

export const backgroundColor = d.vec3f(28, 28, 28).div(255);

export const initialControls = ExampleControls({
  lightColor: d.vec3f(1, 0.7, 0),
  lightDirection: d.vec3f(0, 7, -7),
  ambientColor: d.vec3f(0.6, 0.6, 0.6),
  ambientStrength: 0.5,
  specularExponent: 8,
});
