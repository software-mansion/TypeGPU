/*
{
  "title": "Matrix Multiplication"
}
*/

import { addElement, addParameter } from '@wigsill/example-toolkit';
import {
  createRuntime,
  dynamicArrayOf,
  f32,
  struct,
  vec2f,
  wgsl,
} from 'wigsill';

const runtime = await createRuntime();

const workgroupSize = [8, 8] as [number, number];

const matrixStruct = struct({
  size: vec2f,
  numbers: dynamicArrayOf(f32, 65),
});

type MatrixType = typeof matrixStruct.__unwrapped;

let firstMatrix: MatrixType;
let secondMatrix: MatrixType;

const firstMatrixBuffer = wgsl
  .buffer(matrixStruct)
  .$name('first_matrix')
  .$allowReadonlyStorage();

const secondMatrixBuffer = wgsl
  .buffer(matrixStruct)
  .$name('second_matrix')
  .$allowReadonlyStorage();

const resultMatrixBuffer = wgsl
  .buffer(matrixStruct)
  .$name('result_matrix')
  .$allowMutableStorage();

const firstMatrixData = firstMatrixBuffer.asReadonlyStorage();
const secondMatrixData = secondMatrixBuffer.asReadonlyStorage();
const resultMatrixData = resultMatrixBuffer.asStorage();

const program = runtime.makeComputePipeline({
  workgroupSize: workgroupSize,
  args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
  code: wgsl`
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

let firstMatrixRowCount = 3;
let firstMatrixColumnCount = 4;
let secondMatrixColumnCount = 2;

const firstTable = await addElement('table', {
  label: 'first matrix',
});
const secondTable = await addElement('table', {
  label: 'second matrix',
});
const resultTable = await addElement('table', {
  label: 'result matrix',
});

async function run() {
  firstMatrix = {
    size: [firstMatrixRowCount, firstMatrixColumnCount],
    numbers: Array(firstMatrixRowCount * firstMatrixColumnCount)
      .fill(0)
      .map(() => Math.floor(Math.random() * 10)),
  };

  firstMatrixBuffer.write(runtime, firstMatrix);

  secondMatrix = {
    size: [firstMatrixColumnCount, secondMatrixColumnCount],
    numbers: Array(firstMatrixColumnCount * secondMatrixColumnCount)
      .fill(0)
      .map(() => Math.floor(Math.random() * 10)),
  };

  secondMatrixBuffer.write(runtime, secondMatrix);

  const workgroupCountX = Math.ceil(firstMatrix.size[0] / workgroupSize[0]);
  const workgroupCountY = Math.ceil(secondMatrix.size[1] / workgroupSize[1]);

  program.execute([workgroupCountX, workgroupCountY]);
  runtime.flush();

  const multiplicationResult = await resultMatrixBuffer.read(runtime);

  const unflatMatrix = (matrix: MatrixType) =>
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

let initializing = true;

addParameter(
  'firstMatrixRowCount',
  {
    initial: firstMatrixRowCount,
    min: 1,
    max: 6,
    step: 1,
  },
  (value) => {
    firstMatrixRowCount = value;
    if (!initializing) run();
  },
);

addParameter(
  'firstMatrixColumnCount',
  {
    initial: firstMatrixColumnCount,
    min: 1,
    max: 6,
    step: 1,
  },
  (value) => {
    firstMatrixColumnCount = value;
    if (!initializing) run();
  },
);

addParameter(
  'secondMatrixColumnCount',
  {
    initial: secondMatrixColumnCount,
    min: 1,
    max: 6,
    step: 1,
  },
  (value) => {
    secondMatrixColumnCount = value;
    if (!initializing) run();
  },
);

initializing = false;
run();
