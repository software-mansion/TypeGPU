/*
{
  "title": "Basic Triangle"
}
*/

import { wgsl } from 'wigsill';
import { defineLayout } from '@wigsill/example-toolkit';

const some = wgsl.fn()`() -> f32 {
  return 1. + 2.;
}`;

return {
  eachFrame: () => {},

  dispose() {},
};
