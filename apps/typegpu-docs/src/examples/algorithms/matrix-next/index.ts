import tgpu from 'typegpu';
import { INITIAL_MAX_MATRIX_SIZE, TILE_SIZE } from './params.ts';
import { type CalculationStrategy, computeLayout, createMatrixData, MatrixInfo } from './types.ts';
import { computeSharedMemory } from './computeShared.ts';
import { computeSimple } from './computeSimple.ts';
import { multiplyMatricesCPU } from './computeCpu.ts';
import { defineControls } from '../../common/defineControls.ts';

const state = {
  dimensions: { firstRowCount: 3, firstColumnCount: 4, secondColumnCount: 2 },
  strategy: 'gpu-optimized' as CalculationStrategy,
  bufferCapacity: INITIAL_MAX_MATRIX_SIZE ** 2,
  matrices: {
    first: [] as number[],
    second: [] as number[],
    result: [] as number[],
  },
  gpuTime: 0,
};

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');

const buffers = {
  first: root.createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE)).$usage('storage'),
  second: root.createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE)).$usage('storage'),
  result: root.createBuffer(createMatrixData(INITIAL_MAX_MATRIX_SIZE)).$usage('storage'),
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
  const performanceCallback = (start: bigint, end: bigint) => {
    state.gpuTime = Number(end - start) / 1_000_000;
  };

  const optimized = root.createComputePipeline({
    compute: computeSharedMemory,
  });
  const simple = root.createComputePipeline({
    compute: computeSimple,
  });

  return {
    'gpu-optimized': hasTimestampQuery
      ? optimized.withPerformanceCallback(performanceCallback)
      : optimized,
    'gpu-simple': hasTimestampQuery ? simple.withPerformanceCallback(performanceCallback) : simple,
  };
}

function resizeBuffersIfNeeded(requiredSize: number) {
  if (requiredSize <= state.bufferCapacity) {
    return;
  }

  while (state.bufferCapacity < requiredSize) {
    state.bufferCapacity *= 2;
  }

  for (const buffer of [buffers.first, buffers.second, buffers.result]) {
    buffer.destroy();
  }

  buffers.first = root.createBuffer(createMatrixData(state.bufferCapacity)).$usage('storage');
  buffers.second = root.createBuffer(createMatrixData(state.bufferCapacity)).$usage('storage');
  buffers.result = root.createBuffer(createMatrixData(state.bufferCapacity)).$usage('storage');

  bindGroup = createBindGroup();
}

function createMatrix(rows: number, cols: number) {
  return Array.from({ length: rows * cols }, () => Math.floor(Math.random() * 10));
}

function generateMatrices() {
  const { firstRowCount, firstColumnCount, secondColumnCount } = state.dimensions;

  state.matrices.first = createMatrix(firstRowCount, firstColumnCount);
  state.matrices.second = createMatrix(firstColumnCount, secondColumnCount);

  updateInputDisplays();
}

function updateInputDisplays() {
  const { firstRowCount, firstColumnCount, secondColumnCount } = state.dimensions;

  printMatrixToHtml(firstTable, state.matrices.first, firstRowCount, firstColumnCount);
  printMatrixToHtml(secondTable, state.matrices.second, firstColumnCount, secondColumnCount);
}

let isComputing = false;

async function compute() {
  if (isComputing) {
    console.warn('Computation already in progress');
    return;
  }
  isComputing = true;

  try {
    const { firstRowCount, firstColumnCount, secondColumnCount } = state.dimensions;
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
        .with(bindGroup)
        .dispatchWorkgroups(workgroupCount.x, workgroupCount.y);

      await root.device.queue.onSubmittedWorkDone();

      const gpuResult = await buffers.result.read();
      state.matrices.result = gpuResult.slice(0, firstRowCount * secondColumnCount);
    }

    const totalTime = performance.now() - startTime;
    const strategyName = {
      'gpu-optimized': 'GPU (Optimized)',
      'gpu-simple': 'GPU (Simple)',
      cpu: 'CPU',
    }[state.strategy];

    const showGpu = state.strategy !== 'cpu' && hasTimestampQuery;
    updateTimingDisplay(strategyName, totalTime, showGpu ? state.gpuTime : undefined);

    printMatrixToHtml(resultTable, state.matrices.result, firstRowCount, secondColumnCount);
  } finally {
    isComputing = false;
  }
}

// #region UI

const firstTable = document.querySelector('.matrix-a') as HTMLDivElement;
const secondTable = document.querySelector('.matrix-b') as HTMLDivElement;
const resultTable = document.querySelector('.matrix-result') as HTMLDivElement;
const timingDisplay = document.querySelector('.timing-content') as HTMLDivElement;

generateMatrices();

function updateTimingDisplay(strategy: string, totalTime: number, gpuTime?: number) {
  if (!timingDisplay) return;

  timingDisplay.innerHTML =
    gpuTime !== undefined
      ? `<div>${strategy} computation:</div>
       <div style="font-size: 0.9em; margin-top: 0.25rem;">
         Total: ${totalTime.toFixed(2)}ms | GPU: ${gpuTime >= 0.01 ? gpuTime.toFixed(2) : '<0.01'}ms
       </div>`
      : `${strategy} computation: ${totalTime.toFixed(2)}ms`;
}

function printMatrixToHtml(element: HTMLDivElement, matrix: number[], rows: number, cols: number) {
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

// #endregion

// #region Example controls & Cleanup

const paramSettings = { min: 1, max: 512, step: 1 };

export const controls = defineControls({
  Reshuffle: { onButtonClick: () => generateMatrices() },
  Compute: { onButtonClick: () => compute() },
  strategy: {
    initial: 'gpu-optimized',
    options: ['gpu-optimized', 'gpu-simple', 'cpu'],
    onSelectChange: (value) => {
      state.strategy = value;
    },
  },
  '#1 rows': {
    initial: state.dimensions.firstRowCount,
    ...paramSettings,
    onSliderChange: (value) => {
      state.dimensions.firstRowCount = value;
      generateMatrices();
    },
  },
  '#1 columns': {
    initial: state.dimensions.firstColumnCount,
    ...paramSettings,
    onSliderChange: (value) => {
      state.dimensions.firstColumnCount = value;
      generateMatrices();
    },
  },
  '#2 columns': {
    initial: state.dimensions.secondColumnCount,
    ...paramSettings,
    onSliderChange: (value) => {
      state.dimensions.secondColumnCount = value;
      generateMatrices();
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
