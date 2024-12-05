import {
  type Infer,
  arrayOf,
  f32,
  struct,
  type v2f,
  vec2f,
} from 'typegpu/data';
import tgpu from 'typegpu/experimental';

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
  size: v2f,
  initValue: (row: number, col: number) => number,
) {
  return {
    size: size,
    numbers: Array(size.x * size.y)
      .fill(0)
      .map((_, i) => initValue(Math.floor(i / size.y), i % size.y)),
  };
}

const layout = tgpu.bindGroupLayout({
  firstMatrix: { storage: MatrixStruct, access: 'readonly' },
  secondMatrix: { storage: MatrixStruct, access: 'readonly' },
  resultMatrix: { storage: MatrixStruct, access: 'mutable' },
});

const shaderCode = /* wgsl */ `

@group(0) @binding(0) var<storage, read> firstMatrix: MatrixStruct;
@group(0) @binding(1) var<storage, read> secondMatrix: MatrixStruct;
@group(0) @binding(2) var<storage, read_write> resultMatrix: MatrixStruct;

@compute @workgroup_size(${workgroupSize.join(', ')})
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  if (global_id.x >= u32(firstMatrix.size.x) || global_id.y >= u32(secondMatrix.size.y)) {
    return;
  }
  
  if (global_id.x + global_id.y == 0u) {
    resultMatrix.size = vec2(firstMatrix.size.x, secondMatrix.size.y);
  }
  
  let resultCell = vec2(global_id.x, global_id.y);
  var result = 0.0;
  
  for (var i = 0u; i < u32(firstMatrix.size.y); i = i + 1u) {
    let a = i + resultCell.x * u32(firstMatrix.size.y);
    let b = resultCell.y + i * u32(secondMatrix.size.y);
    result = result + firstMatrix.numbers[a] * secondMatrix.numbers[b];
  }
  
  let index = resultCell.y + resultCell.x * u32(secondMatrix.size.y);
  resultMatrix.numbers[index] = result;
}`;

const root = await tgpu.init();
const device = root.device;

const firstMatrixBuffer = root.createBuffer(MatrixStruct).$usage('storage');
const secondMatrixBuffer = root.createBuffer(MatrixStruct).$usage('storage');
const resultMatrixBuffer = root.createBuffer(MatrixStruct).$usage('storage');

const pipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(layout)],
  }),
  compute: {
    module: device.createShaderModule({
      code: tgpu.resolve({
        input: shaderCode,
        extraDependencies: { MatrixStruct },
      }),
    }),
  },
});

const bindGroup = layout.populate({
  firstMatrix: firstMatrixBuffer,
  secondMatrix: secondMatrixBuffer,
  resultMatrix: resultMatrixBuffer,
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

  const encoder = device.createCommandEncoder();

  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, root.unwrap(bindGroup));
  pass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
  pass.end();

  device.queue.submit([encoder.finish()]);

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
  matrix: Infer<typeof MatrixStruct>,
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
