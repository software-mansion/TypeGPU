import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

let gameSize = 64;
let timestep = 15;
let paused = false;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

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
  // biome-ignore format: clearer that way
  return getCell(x - 1, y - 1) + getCell(x, y - 1) + getCell(x + 1, y - 1) +
    getCell(x - 1, y) + getCell(x + 1, y) +
    getCell(x - 1, y + 1) + getCell(x, y + 1) + getCell(x + 1, y + 1);
};

const computeFn = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  const n = countNeighbors(x, y);
  computeLayout.$.next[getIndex(x, y)] = d.u32(
    std.select(n === 3, n === 2 || n === 3, getCell(x, y) === 1),
  );
});

const squareBuffer = root
  .createBuffer(d.arrayOf(d.u32, 8), [0, 0, 1, 0, 0, 1, 1, 1])
  .$usage('vertex');

const squareVertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2u), 'vertex');
const cellsVertexLayout = tgpu.vertexLayout(d.arrayOf(d.u32), 'instance');

const vertexFn = tgpu['~unstable'].vertexFn({
  in: {
    iid: d.builtin.instanceIndex,
    cell: d.u32,
    pos: d.vec2u,
  },
  out: {
    pos: d.builtin.position,
    cell: d.interpolate('flat', d.u32),
    uv: d.vec2f,
  },
})(({ iid, cell, pos }) => {
  const w = d.u32(size.x);
  const h = d.u32(size.y);

  const col = iid % w;
  const row = d.u32(iid / w);

  const gx = col + pos.x;
  const gy = row + pos.y;

  const maxWH = d.f32(std.max(w, h));
  const x = (d.f32(gx) * 2 - d.f32(w)) / maxWH;
  const y = (d.f32(gy) * 2 - d.f32(h)) / maxWH;

  return {
    pos: d.vec4f(x, y, 0, 1),
    cell,
    uv: d.vec2f((x + 1) * 0.5, (y + 1) * 0.5),
  };
});

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    cell: d.interpolate('flat', d.u32),
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ cell, uv }) => {
  if (cell === d.u32(0)) {
    std.discard();
  }
  const u = uv.div(1.5);
  return d.vec4f(u.x, u.y, 1 - u.x, 0.8);
});

const renderPipeline = root['~unstable']
  .withVertex(vertexFn, {
    cell: cellsVertexLayout.attrib,
    pos: squareVertexLayout.attrib,
  })
  .withFragment(fragmentFn, {
    format: presentationFormat,
  })
  .withPrimitive({ topology: 'triangle-strip' })
  .createPipeline();

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
  }),
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
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(cellsVertexLayout, buffers[1 - swap])
    //@ts-expect-error: an array of u32 is compatible with an array of vec2u but it's cursed
    .with(squareVertexLayout, squareBuffer)
    .draw(4, length);

  swap ^= 1;
}

  return { run, cleanup: () => {} };
}

let game = createGame();
let disposed = false;

function animate(timestamp: number) {
  if (disposed) return;
  if (!paused) {
    game.run(timestamp);
  }
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

export const controls = {
  size: {
    initial: '64',
    options: [16, 32, 64, 128, 256, 512].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gameSize = Number.parseInt(value);
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
};

export function onCleanup() {
  paused = true;
  game.cleanup();
  root.destroy();
}
