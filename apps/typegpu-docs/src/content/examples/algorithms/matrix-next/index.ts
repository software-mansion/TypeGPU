import tgpu from 'typegpu';
import { INITIAL_MAX_MATRIX_SIZE, TILE_SIZE } from './params.ts';
import {
  type CalculationStrategy,
  computeLayout,
  createMatrixData,
  MatrixInfo,
} from './types.ts';
import { computeSharedMemory } from './computeShared.ts';
import { computeSimple } from './computeSimple.ts';
import { multiplyMatricesCPU } from './computeCpu.ts';

const state = {
  dimensions: { firstRowCount: 3, firstColumnCount: 4, secondColumnCount: 2 },
  strategy: 'gpu-optimized' as CalculationStrategy,
  bufferCapacity: INITIAL_MAX_MATRIX_SIZE ** 2,
  matrices: {
    first: [] as number[],
    second: [] as number[],
    result: [] as number[],
  },
  kernelTime: 0,
  hasComputed: false,
};

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');

const buffers = {
  first: root
    .createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE))
    .$usage('storage'),
  second: root
    .createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE))
    .$usage('storage'),
  result: root
    .createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE))
    .$usage('storage'),
  info: root.createBuffer(MatrixInfo, state.dimensions).$usage('uniform'),
};

let bindGroup = createBindGroup();

const pipelines = createPipelines();

function createBindGroup() {
  return root.createBindGroup(computeLayout, {
    firstMatrix: buffers.first,
    secondMatrix: buffers.second,
    resultMatrix: buffers.result,
    dimensions: buffers.info,
  });
}

function createPipelines() {
  const performanceListener = hasTimestampQuery
    ? (start: bigint, end: bigint) => {
      state.kernelTime = Number(end - start) / 1_000_000;
    }
    : undefined;

  const optimized = root['~unstable']
    .withCompute(computeSharedMemory)
    .createPipeline();
  const simple = root['~unstable'].withCompute(computeSimple).createPipeline();

  return {
    'gpu-optimized': performanceListener
      ? optimized.withPerformanceListener(performanceListener)
      : optimized,
    'gpu-simple': performanceListener
      ? simple.withPerformanceListener(performanceListener)
      : simple,
  };
}

function resizeBuffersIfNeeded(requiredSize: number) {
  if (requiredSize <= state.bufferCapacity) return;

  while (state.bufferCapacity < requiredSize) state.bufferCapacity *= 2;

  for (const buffer of Object.values(buffers).slice(0, 3)) {
    buffer.destroy();
  }

  buffers.first = root
    .createBuffer(createMatrixData(state.bufferCapacity))
    .$usage('storage');
  buffers.second = root
    .createBuffer(createMatrixData(state.bufferCapacity))
    .$usage('storage');
  buffers.result = root
    .createBuffer(createMatrixData(state.bufferCapacity))
    .$usage('storage');

  bindGroup = createBindGroup();
}

function createMatrix(rows: number, cols: number) {
  return Array.from(
    { length: rows * cols },
    () => Math.floor(Math.random() * 10),
  );
}

function generateMatrices() {
  const { firstRowCount, firstColumnCount, secondColumnCount } =
    state.dimensions;

  state.matrices.first = createMatrix(firstRowCount, firstColumnCount);
  state.matrices.second = createMatrix(firstColumnCount, secondColumnCount);

  updateInputDisplays();
}

function updateInputDisplays() {
  const { firstRowCount, firstColumnCount, secondColumnCount } =
    state.dimensions;

  printMatrixToHtml(
    firstTable,
    state.matrices.first,
    firstRowCount,
    firstColumnCount,
  );
  printMatrixToHtml(
    secondTable,
    state.matrices.second,
    firstColumnCount,
    secondColumnCount,
  );
}

async function compute() {
  const { firstRowCount, firstColumnCount, secondColumnCount } =
    state.dimensions;
  const maxSize = Math.max(
    firstRowCount * firstColumnCount,
    firstColumnCount * secondColumnCount,
    firstRowCount * secondColumnCount,
  );

  const startTime = performance.now();

  if (state.strategy === 'cpu') {
    state.matrices.result = multiplyMatricesCPU(
      state.matrices.first,
      state.matrices.second,
      firstRowCount,
      firstColumnCount,
      secondColumnCount,
    );
  } else {
    resizeBuffersIfNeeded(maxSize);
    buffers.info.write(state.dimensions);
    buffers.first.write(state.matrices.first);
    buffers.second.write(state.matrices.second);

    const workgroupCount = {
      x: Math.ceil(firstRowCount / TILE_SIZE),
      y: Math.ceil(secondColumnCount / TILE_SIZE),
    };

    pipelines[state.strategy]
      .with(computeLayout, bindGroup)
      .dispatchWorkgroups(workgroupCount.x, workgroupCount.y);

    await root.device.queue.onSubmittedWorkDone();

    const gpuResult = await buffers.result.read();
    state.matrices.result = gpuResult.slice(
      0,
      firstRowCount * secondColumnCount,
    );
  }

  const totalTime = performance.now() - startTime;
  const strategyName = {
    'gpu-optimized': 'GPU (Optimized)',
    'gpu-simple': 'GPU (Simple)',
    cpu: 'CPU',
  }[state.strategy];

  const showKernel = state.strategy !== 'cpu' && hasTimestampQuery;
  updateTimingDisplay(
    strategyName,
    totalTime,
    showKernel ? state.kernelTime : undefined,
  );

  state.hasComputed = true;
  printMatrixToHtml(
    resultTable,
    state.matrices.result,
    firstRowCount,
    secondColumnCount,
  );
}

const firstTable = document.querySelector('.matrix-a') as HTMLDivElement;
const secondTable = document.querySelector('.matrix-b') as HTMLDivElement;
const resultTable = document.querySelector('.matrix-result') as HTMLDivElement;

generateMatrices();
showInitialResultMessage();

let timingDisplay: HTMLDivElement | null = null;

function createTimingDisplay() {
  if (timingDisplay) return;

  timingDisplay = document.createElement('div');
  timingDisplay.style.cssText =
    'text-align: center; font-weight: bold; margin-bottom: 1rem; padding: 0.5rem; background-color: #f8f9fa; border-radius: 0.25rem; border: 1px solid #e9ecef; font-family: monospace;';

  const container = document.querySelector('.matrices-container');
  container?.parentElement?.insertBefore(timingDisplay, container);
}

function updateTimingDisplay(
  strategy: string,
  totalTime: number,
  kernelTime?: number,
) {
  createTimingDisplay();
  if (!timingDisplay) return;

  timingDisplay.innerHTML = kernelTime !== undefined
    ? `<div>${strategy} computation:</div>
       <div style="font-size: 0.9em; margin-top: 0.25rem;">
         Total: ${totalTime.toFixed(2)}ms | Kernel: ${
      kernelTime >= 0.01 ? kernelTime.toFixed(2) : '<0.01'
    }ms
       </div>`
    : `${strategy} computation: ${totalTime.toFixed(2)}ms`;
}

function showInitialResultMessage() {
  resultTable.style.gridTemplateColumns = '1fr';
  resultTable.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      color: #666;
      font-style: italic;
      text-align: center;
      min-height: 80px;
      border: 2px dashed #ddd;
      border-radius: 8px;
      background-color: #f9f9f9;
    ">
      Press Compute to calculate the result
    </div>
  `;
}

function printMatrixToHtml(
  element: HTMLDivElement,
  matrix: number[],
  rows: number,
  cols: number,
) {
  const isMobile = window.innerWidth <= 480;
  const isTablet = window.innerWidth <= 768;
  const maxDisplaySize = isMobile ? 3 : isTablet ? 5 : 8;
  const shouldTruncate = rows > maxDisplaySize || cols > maxDisplaySize;

  if (shouldTruncate) {
    const displayRows = Math.min(rows, maxDisplaySize);
    const displayCols = Math.min(cols, maxDisplaySize);
    const needsColEllipsis = cols > maxDisplaySize;
    const needsRowEllipsis = rows > maxDisplaySize;
    const gridCols = displayCols + (needsColEllipsis ? 1 : 0);

    element.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;

    let html = '';
    for (let row = 0; row < displayRows; row++) {
      for (let col = 0; col < displayCols; col++) {
        html += `<div>${matrix[col + row * cols]}</div>`;
      }
      if (needsColEllipsis) html += '<div>...</div>';
    }

    if (needsRowEllipsis) {
      for (let col = 0; col < gridCols; col++) {
        html += '<div>⋮</div>';
      }
    }

    element.innerHTML = html;

    const sizeInfo = document.createElement('div');
    sizeInfo.textContent = `${rows}×${cols}`;
    sizeInfo.style.cssText =
      'grid-column: 1 / -1; text-align: center; font-size: 0.8em; color: #666; margin-top: 0.5rem;';
    element.appendChild(sizeInfo);
  } else {
    element.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    element.innerHTML = matrix
      .slice(0, rows * cols)
      .map((x) => `<div>${x}</div>`)
      .join('');
  }
}

const paramSettings = { min: 1, max: 512, step: 1 };

export const controls = {
  Reshuffle: { onButtonClick: () => generateMatrices() },
  Compute: { onButtonClick: () => compute() },
  strategy: {
    initial: 'gpu-optimized',
    options: ['gpu-optimized', 'gpu-simple', 'cpu'],
    onSelectChange: (value: CalculationStrategy) => {
      state.strategy = value;
    },
  },
  '#1 rows': {
    initial: state.dimensions.firstRowCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      state.dimensions.firstRowCount = value;
      generateMatrices();
      if (!state.hasComputed) {
        showInitialResultMessage();
      }
    },
  },
  '#1 columns': {
    initial: state.dimensions.firstColumnCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      state.dimensions.firstColumnCount = value;
      generateMatrices();
      if (!state.hasComputed) {
        showInitialResultMessage();
      }
    },
  },
  '#2 columns': {
    initial: state.dimensions.secondColumnCount,
    ...paramSettings,
    onSliderChange: (value: number) => {
      state.dimensions.secondColumnCount = value;
      generateMatrices();
      if (!state.hasComputed) {
        showInitialResultMessage();
      }
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
