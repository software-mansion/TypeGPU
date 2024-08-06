/*
{
  "title": "Copy",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import { addElement } from '@typegpu/example-toolkit';
// --

import { createRuntime, wgsl } from 'typegpu';
import { arrayOf, i32, struct, u32, vec3i } from 'typegpu/data';

const s2 = struct({
  aa: vec3i,
  bb: arrayOf(u32, 3),
});

const s1 = struct({
  a: u32,
  b: u32,
  c: i32,
  d: s2,
});

const buffer1 = wgsl.buffer(s1, {
  a: 1,
  b: 2,
  c: 3,
  d: { aa: [4, 5, 6], bb: [7, 8, 9] },
});

const buffer2 = wgsl.buffer(s1, {
  a: 10,
  b: 20,
  c: 30,
  d: { aa: [40, 50, 60], bb: [70, 80, 90] },
});

const runtime = await createRuntime();

async function reset() {
  const values = {
    a: 1,
    b: 2,
    c: 3,
    d: {
      aa: [4, 5, 6] as [number, number, number],
      bb: [7, 8, 9] as [number, number, number],
    },
  };
  runtime.writeBuffer(buffer1, values);
  table.setMatrix([
    [values.a, values.b, values.c],
    [values.d.aa[0], values.d.aa[1], values.d.aa[2]],
    [values.d.bb[0], values.d.bb[1], values.d.bb[2]],
  ]);
}
async function copy() {
  runtime.copyBuffer(buffer2, buffer1, {
    a: 1,
    b: 1,
    c: 0,
    d: { aa: [1, 0, 1], bb: [0, 1, 1] },
  });
  const values = await runtime.readBuffer(buffer1);
  table.setMatrix([
    [values.a, values.b, values.c],
    [values.d.aa[0], values.d.aa[1], values.d.aa[2]],
    [values.d.bb[0], values.d.bb[1], values.d.bb[2]],
  ]);
}

addElement('button', {
  label: 'Copy',
  onClick: copy,
});
addElement('button', {
  label: 'Reset',
  onClick: reset,
});

const sourceTable = await addElement('table', {
  label: 'Copy to',
});
sourceTable.setMatrix([
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
]);

const destinationTable = await addElement('table', {
  label: 'Copy from',
});
destinationTable.setMatrix([
  [10, 20, 30],
  [40, 50, 60],
  [70, 80, 90],
]);

const table = await addElement('table', {
  label: 'Result',
});
table.setMatrix([
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
]);
