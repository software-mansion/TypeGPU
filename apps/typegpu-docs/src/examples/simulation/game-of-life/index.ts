import tgpu, { d, std } from 'typegpu';
import { fragmentFn } from './shaders/fragment.ts';
import { sizeSlot, vertexFn } from './shaders/vertex.ts';
import { defineControls } from '../../common/defineControls.ts';

let gameSize = 64;
let timestep = 15;
let paused = false;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

function createGame() {
  const size = d.vec2u(gameSize);

  const computeLayout = tgpu.bindGroupLayout({
    current: { storage: d.arrayOf(d.u32) },
    next: { storage: d.arrayOf(d.u32), access: 'mutable' },
  });

  const getIndex = (x: number, y: number) => {
    'use gpu';
    return (y % size.y) * size.x + (x % size.x);
  };

  const getCell = (x: number, y: number) => {
    'use gpu';
    return computeLayout.$.current[getIndex(x, y)];
  };

  const countNeighbors = (x: number, y: number) => {
    'use gpu';
    return getCell(x - 1, y - 1) + getCell(x, y - 1) + getCell(x + 1, y - 1) +
      getCell(x - 1, y) + getCell(x + 1, y) +
      getCell(x - 1, y + 1) + getCell(x, y + 1) + getCell(x + 1, y + 1);
  };

  const computeFn = root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    const n = countNeighbors(x, y);
    computeLayout.$.next[getIndex(x, y)] = d.u32(
      std.select(n === 3, n === 2 || n === 3, getCell(x, y) === 1),
    );
  });

  const squareBuffer = root
    .createBuffer(d.arrayOf(d.vec2u, 4), [
      d.vec2u(0, 0),
      d.vec2u(1, 0),
      d.vec2u(0, 1),
      d.vec2u(1, 1),
    ])
    .$usage('vertex');

  const squareVertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2u), 'vertex');
  const cellsVertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32), 'instance');

  const renderPipeline = root
    .with(sizeSlot, size)
    .createRenderPipeline({
      attribs: {
        cell: cellsVertexLayout.attrib,
        pos: squareVertexLayout.attrib,
      },
      vertex: vertexFn,
      fragment: fragmentFn,
      targets: { format: presentationFormat },
      primitive: { topology: 'triangle-strip' },
    });

  const length = size.x * size.y;
  const buffers = [
    root
      .createBuffer(
        d.arrayOf(d.u32, length),
        Array.from({ length }, () => (Math.random() < 0.25 ? 1 : 0)),
      )
      .$usage('storage', 'vertex'),
    root.createBuffer(d.arrayOf(d.u32, length)).$usage('storage', 'vertex'),
  ];
  const bindGroups = [0, 1].map((i) =>
    root.createBindGroup(computeLayout, {
      current: buffers[i],
      next: buffers[1 - i],
    })
  );

  let swap = 0;
  let lastTimestamp = performance.now();
  function run(timestamp: number) {
    if (timestamp - lastTimestamp <= timestep) {
      return;
    }
    lastTimestamp = timestamp;

    computeFn.with(bindGroups[swap]).dispatchThreads(size.x, size.y);

    renderPipeline
      .withColorAttachment({ view: context })
      .with(cellsVertexLayout, buffers[1 - swap])
      .with(squareVertexLayout, squareBuffer)
      .draw(4, length);

    swap ^= 1;
  }

  return { run, cleanup: () => {} };
}

let game = createGame();
const disposed = false;

function animate(timestamp: number) {
  if (disposed) return;
  if (!paused) {
    game.run(timestamp);
  }
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// #region Example controls & Cleanup

export const controls = defineControls({
  size: {
    initial: 64,
    options: [16, 32, 64, 128, 256, 512],
    onSelectChange: (value) => {
      gameSize = value;
      game.cleanup();
      game = createGame();
    },
  },

  'timestep (ms)': {
    initial: 15,
    min: 8,
    max: 100,
    step: 1,
    onSliderChange: (value: number) => {
      timestep = value;
    },
  },

  pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      paused = value;
    },
  },

  Reset: {
    onButtonClick: () => {
      game.cleanup();
      game = createGame();
    },
  },
});

export function onCleanup() {
  paused = true;
  game.cleanup();
  root.destroy();
}

// #endregion
