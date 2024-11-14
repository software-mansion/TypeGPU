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

let firstRowCount = 3;
let firstColumnCount = 4;
let secondColumnCount = 2;

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

const firstMatrixBuffer = root
  .createBuffer(MatrixStruct)
  .$name('first_matrix')
  .$usage('storage');

const secondMatrixBuffer = root
  .createBuffer(MatrixStruct)
  .$name('second_matrix')
  .$usage('storage');

const resultMatrixBuffer = root
  .createBuffer(MatrixStruct)
  .$name('result_matrix')
  .$usage('storage');

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

async function run() {
  const firstMatrix = createMatrix(vec2f(firstRowCount, firstColumnCount), () =>
    Math.floor(Math.random() * 10),
  );
  const secondMatrix = createMatrix(
    vec2f(firstColumnCount, secondColumnCount),
    () => Math.floor(Math.random() * 10),
  );

  firstMatrixBuffer.write(firstMatrix);
  secondMatrixBuffer.write(secondMatrix);

  const workgroupCountX = Math.ceil(firstMatrix.size.x / workgroupSize[0]);
  const workgroupCountY = Math.ceil(secondMatrix.size.y / workgroupSize[1]);

  program.execute({ workgroups: [workgroupCountX, workgroupCountY] });
  const multiplicationResult = await resultMatrixBuffer.read();

  printMatrixToHtml(firstTable, firstMatrix);
  printMatrixToHtml(secondTable, secondMatrix);
  printMatrixToHtml(resultTable, multiplicationResult);
}

run();

// #region UI

const firstTable = document.querySelector('.matrix-a') as HTMLDivElement;
const secondTable = document.querySelector('.matrix-b') as HTMLDivElement;
const resultTable = document.querySelector('.matrix-result') as HTMLDivElement;

function printMatrixToHtml(
  element: HTMLDivElement,
  matrix: Parsed<typeof MatrixStruct>,
) {
  element.style.gridTemplateColumns = `repeat(${matrix.size.y}, 1fr)`;
  element.innerHTML = matrix.numbers
    .slice(0, matrix.size.x * matrix.size.y)
    .map((x) => `<div>${x}</div>`)
    .join('');
}

// #endregion

// #region Example controls

const paramSettings = {
  min: 1,
  max: MAX_MATRIX_SIZE,
  step: 1,
};

export const controls = {
  Reshuffle: {
    onButtonClick: () => {
      run();
    },
  },

  '#1 rows': {
    initial: firstRowCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      firstRowCount = value;
      run();
    },
  },

  '#1 columns': {
    initial: firstColumnCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      firstColumnCount = value;
      run();
    },
  },

  '#2 columns': {
    initial: secondColumnCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      secondColumnCount = value;
      run();
    },
  },
};

// #endregion

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}
