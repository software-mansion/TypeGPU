/*
{
  "title": "Basic Triangles"
}
*/

import { wgsl } from 'wigsill';
import { defineLayout, onCleanup, onFrame } from '@wigsill/example-toolkit';

wgsl.fn()`() -> f32 {
  return 1. + 2.;
}`;

onFrame(() => {
  console.log('Hello from basic triangle!');
});

onCleanup(() => {
  console.log(`All cleaned up`);
});
