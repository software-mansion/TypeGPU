/*
{
  "title": "Matrix Multiplication",
  "category": "algorithms"
}
*/

// -- Hooks into the example environment
import {
  addButtonParameter,
  addElement,
  addSliderPlumParameter,
} from '@typegpu/example-toolkit';
// --

import { asMutable, asReadonly, builtin, createRuntime, wgsl } from 'typegpu';
import { type Parsed, dynamicArrayOf, f32, struct, vec2f } from 'typegpu/data';

const runtime = await createRuntime();

const workgroupSize = [8, 8] as [number, number];

const MatrixStruct = struct({
  size: vec2f,
  numbers: dynamicArrayOf(f32, 65),
});

const paramSettings = {
  min: 1,
  max: 6,
  step: 1,
};

/**
 * Used to force recomputation of all matrices.
 */
const forceShufflePlum = wgsl.plum<number>(0);
const firstRowCountPlum = addSliderPlumParameter('#1 rows', 3, paramSettings);
const firstColumnCountPlum = addSliderPlumParameter(
  '#1 columns',
  4,
  paramSettings,
);
const secondColumnCountPlum = addSliderPlumParameter(
  '#2 columns',
  2,
  paramSettings,
);

const firstMatrixPlum = wgsl.plum((get) => {
  get(forceShufflePlum); // depending to force recomputation

  return createMatrix([get(firstRowCountPlum), get(firstColumnCountPlum)], () =>
    Math.floor(Math.random() * 10),
  );
});

const secondMatrixPlum = wgsl.plum((get) => {
  get(forceShufflePlum); // depending to force recomputation

  return createMatrix(
    [get(firstColumnCountPlum), get(secondColumnCountPlum)],
    () => Math.floor(Math.random() * 10),
  );
});

const firstMatrixBuffer = wgsl
  .buffer(MatrixStruct, firstMatrixPlum)
  .$name('first_matrix')
  .$allowReadonly();

const secondMatrixBuffer = wgsl
  .buffer(MatrixStruct, secondMatrixPlum)
  .$name('second_matrix')
  .$allowReadonly()
  .$allowMutable();

const resultMatrixBuffer = wgsl
  .buffer(MatrixStruct)
  .$name('result_matrix')
  .$allowMutable();

const firstMatrixData = asReadonly(firstMatrixBuffer);
const secondMatrixData = asReadonly(secondMatrixBuffer);
const resultMatrixData = asMutable(resultMatrixBuffer);

const program = runtime.makeComputePipeline({
  workgroupSize: workgroupSize,
  code: wgsl`
    let global_id = ${builtin.globalInvocationId};
    if (global_id.x >= u32(${firstMatrixData}.size.x) || global_id.y >= u32(${secondMatrixData}.size.y)) {
      return;
    }

    if (global_id.x + global_id.y == 0u) {
      ${resultMatrixData}.size = vec2(${firstMatrixData}.size.x, ${secondMatrixData}.size.y);
      ${resultMatrixData}.numbers.count = u32(${firstMatrixData}.size.x) * u32(${secondMatrixData}.size.y);
    }

    let resultCell = vec2(global_id.x, global_id.y);
    var result = 0.0;

    for (var i = 0u; i < u32(${firstMatrixData}.size.y); i = i + 1u) {
      let a = i + resultCell.x * u32(${firstMatrixData}.size.y);
      let b = resultCell.y + i * u32(${secondMatrixData}.size.y);
      result = result + ${firstMatrixData}.numbers.values[a] * ${secondMatrixData}.numbers.values[b];
    }

    let index = resultCell.y + resultCell.x * u32(${secondMatrixData}.size.y);
    ${resultMatrixData}.numbers.values[index] = result;
`,
});

const firstTable = await addElement('table', {
  label: 'first matrix',
});
const secondTable = await addElement('table', {
  label: 'second matrix',
});
const resultTable = await addElement('table', {
  label: 'result matrix',
});

function createMatrix(
  size: [number, number],
  initValue: (row: number, col: number) => number,
) {
  return {
    size: size,
    numbers: Array(size[0] * size[1])
      .fill(0)
      .map((_, i) => initValue(Math.floor(i / size[1]), i % size[1])),
  };
}

async function run() {
  const firstMatrix = runtime.readPlum(firstMatrixPlum);
  const secondMatrix = runtime.readPlum(secondMatrixPlum);
  const workgroupCountX = Math.ceil(firstMatrix.size[0] / workgroupSize[0]);
  const workgroupCountY = Math.ceil(secondMatrix.size[1] / workgroupSize[1]);

  program.execute({ workgroups: [workgroupCountX, workgroupCountY] });
  const multiplicationResult = await runtime.readBuffer(resultMatrixBuffer);

  const unflatMatrix = (matrix: Parsed<typeof MatrixStruct>) =>
    Array(matrix.size[0])
      .fill(0)
      .map((_, i) =>
        Array(matrix.size[1])
          .fill(0)
          .map((_, j) => matrix.numbers[i * matrix.size[1] + j]),
      );

  firstTable.setMatrix(unflatMatrix(firstMatrix));
  secondTable.setMatrix(unflatMatrix(secondMatrix));

  resultTable.setMatrix(unflatMatrix(multiplicationResult));
}

addButtonParameter('Reshuffle', () => {
  runtime.setPlum(forceShufflePlum, (prev) => 1 - prev);
});

run();

runtime.onPlumChange(firstRowCountPlum, run);
runtime.onPlumChange(firstColumnCountPlum, run);
runtime.onPlumChange(secondColumnCountPlum, run);
runtime.onPlumChange(forceShufflePlum, run);
