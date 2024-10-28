// -- Hooks into the example environment
import {
  addButtonParameter,
  addSliderPlumParameter,
} from '@typegpu/example-toolkit';
// --

import { type Parsed, arrayOf, f32, struct, vec2f } from 'typegpu/data';
import tgpu, {
  asMutable,
  asReadonly,
  builtin,
  wgsl,
} from 'typegpu/experimental';

const root = await tgpu.init();

const workgroupSize = [8, 8] as [number, number];

const MAX_MATRIX_SIZE = 6;

const MatrixStruct = struct({
  size: vec2f,
  numbers: arrayOf(f32, MAX_MATRIX_SIZE ** 2),
});

const paramSettings = {
  min: 1,
  max: MAX_MATRIX_SIZE,
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

const firstMatrixBuffer = root
  .createBuffer(MatrixStruct, firstMatrixPlum)
  .$name('first_matrix')
  .$usage(tgpu.Storage);

const secondMatrixBuffer = root
  .createBuffer(MatrixStruct, secondMatrixPlum)
  .$name('second_matrix')
  .$usage(tgpu.Storage);

const resultMatrixBuffer = root
  .createBuffer(MatrixStruct)
  .$name('result_matrix')
  .$usage(tgpu.Storage);

const firstMatrixData = asReadonly(firstMatrixBuffer);
const secondMatrixData = asReadonly(secondMatrixBuffer);
const resultMatrixData = asMutable(resultMatrixBuffer);

const program = root.makeComputePipeline({
  workgroupSize: workgroupSize,
  code: wgsl`
    let global_id = ${builtin.globalInvocationId};
    if (global_id.x >= u32(${firstMatrixData}.size.x) || global_id.y >= u32(${secondMatrixData}.size.y)) {
      return;
    }

    if (global_id.x + global_id.y == 0u) {
      ${resultMatrixData}.size = vec2(${firstMatrixData}.size.x, ${secondMatrixData}.size.y);
    }

    let resultCell = vec2(global_id.x, global_id.y);
    var result = 0.0;

    for (var i = 0u; i < u32(${firstMatrixData}.size.y); i = i + 1u) {
      let a = i + resultCell.x * u32(${firstMatrixData}.size.y);
      let b = resultCell.y + i * u32(${secondMatrixData}.size.y);
      result = result + ${firstMatrixData}.numbers[a] * ${secondMatrixData}.numbers[b];
    }

    let index = resultCell.y + resultCell.x * u32(${secondMatrixData}.size.y);
    ${resultMatrixData}.numbers[index] = result;
`,
});

const firstTable = document.querySelector('.matrix-a') as HTMLDivElement;
const secondTable = document.querySelector('.matrix-b') as HTMLDivElement;
const resultTable = document.querySelector('.matrix-result') as HTMLDivElement;

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
  const firstMatrix = root.readPlum(firstMatrixPlum);
  const secondMatrix = root.readPlum(secondMatrixPlum);
  const workgroupCountX = Math.ceil(firstMatrix.size.x / workgroupSize[0]);
  const workgroupCountY = Math.ceil(secondMatrix.size.y / workgroupSize[1]);

  program.execute({ workgroups: [workgroupCountX, workgroupCountY] });
  const multiplicationResult = await resultMatrixBuffer.read();

  const matrixToHtml = (matrix: Parsed<typeof MatrixStruct>) =>
    `<div 
        style="display: grid; gap: 0.5rem; background: white; padding: 1rem; border-radius: 0.25rem; grid-template-columns: repeat(${matrix.size.y}, 1fr)">${matrix.numbers
          .slice(0, matrix.size.x * matrix.size.y)
          .map((x) => `<div style="padding: 0.5rem;">${x}</div>`)
          .join('')}</div>`;

  firstTable.innerHTML = matrixToHtml(firstMatrix);
  secondTable.innerHTML = matrixToHtml(secondMatrix);
  resultTable.innerHTML = matrixToHtml(multiplicationResult);
}

addButtonParameter('Reshuffle', () => {
  root.setPlum(forceShufflePlum, (prev) => 1 - prev);
});

run();

root.onPlumChange(firstRowCountPlum, run);
root.onPlumChange(firstColumnCountPlum, run);
root.onPlumChange(secondColumnCountPlum, run);
root.onPlumChange(forceShufflePlum, run);
