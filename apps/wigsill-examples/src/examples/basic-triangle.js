/*
{
  "title": "Basic Triangle"
}
*/

import Default, { wgsl as wigsill } from 'wigsill';
import { defineLayout, onCleanup } from '@wigsill/example-toolkit';

const some = wgsl.fn()`() -> f32 {
  return 1. + 2.;
}`;

onCleanup(() => {
  console.log(`All cleaned up`);
});
