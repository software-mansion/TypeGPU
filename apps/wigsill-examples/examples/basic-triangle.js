/*
{
  "title": "Basic Triangles"
}
*/

import { wgsl } from 'wigsill';
import { addCanvas, onCleanup, onFrame } from '@wigsill/example-toolkit';

const canvas = await addCanvas();
console.log(canvas);

wgsl.fn()`() -> f32 {
  return 1. + 2.;
}`;

onFrame(() => {
  console.log('Hello from basic triangle!');
});

onCleanup(() => {
  console.log(`All cleaned up`);
});
