/*
{
  "title": "Basic Triangles"
}
*/

import { wgsl } from 'wigsill';
import { addElement, onCleanup, onFrame } from '@wigsill/example-toolkit';

const canvas = await addElement('canvas');
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
