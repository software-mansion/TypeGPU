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

import { builtin, createRuntime, wgsl } from 'typegpu';
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

  return createMatrix(
    vec2f(get(firstRowCountPlum), get(firstColumnCountPlum)),
    () => Math.floor(Math.random() * 10),
  );
});

const secondMatrixPlum = wgsl.plum((get) => {
  get(forceShufflePlum); // depending to force recomputation

  return createMatrix(
    vec2f(get(firstColumnCountPlum), get(secondColumnCountPlum)),
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
  .$allowReadonly();

const resultMatrixBuffer = wgsl
  .buffer(MatrixStruct)
  .$name('result_matrix')
  .$allowMutable();

const firstMatrixData = firstMatrixBuffer.asReadonly();
const secondMatrixData = secondMatrixBuffer.asReadonly();
const resultMatrixData = resultMatrixBuffer.asMutable();

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
  size: vec2f,
  initValue: (row: number, col: number) => number,
) {
  return {
    size: size,
    numbers: Array(size.x * size.y)
      .fill(0)
      .map((_, i) => initValue(Math.floor(i / size.y), i % size.y)),
  };
}

async function run() {
  const firstMatrix = runtime.readPlum(firstMatrixPlum);
  const secondMatrix = runtime.readPlum(secondMatrixPlum);
  const workgroupCountX = Math.ceil(firstMatrix.size.x / workgroupSize[0]);
  const workgroupCountY = Math.ceil(secondMatrix.size.y / workgroupSize[1]);

  program.execute({ workgroups: [workgroupCountX, workgroupCountY] });
  const multiplicationResult = await runtime.readBuffer(resultMatrixBuffer);

  const unflatMatrix = (matrix: Parsed<typeof MatrixStruct>) =>
    Array(matrix.size.x)
      .fill(0)
      .map((_, i) =>
        Array(matrix.size.y)
          .fill(0)
          .map((_, j) => matrix.numbers[i * matrix.size.y + j]),
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
