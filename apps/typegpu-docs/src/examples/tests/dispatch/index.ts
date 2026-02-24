import tgpu, { d, std } from 'typegpu';

const root = await tgpu.init();

function isEqual(e1: unknown, e2: unknown): boolean {
  if (Array.isArray(e1) && Array.isArray(e2)) {
    return e1.every((elem, i) => isEqual(elem, e2[i]));
  }
  return e1 === e2;
}

async function test0d(): Promise<boolean> {
  const mutable = root.createMutable(d.u32);
  root.createGuardedComputePipeline(() => {
    'use gpu';
    mutable.$ = 126;
  }).dispatchThreads();
  const filled = await mutable.read();
  return isEqual(filled, 126);
}

async function test1d(): Promise<boolean> {
  const size = [7] as const;
  const mutable = root.createMutable(d.arrayOf(d.u32, size[0]));
  root.createGuardedComputePipeline((x) => {
    'use gpu';
    mutable.$[x] = x;
  }).dispatchThreads(...size);
  const filled = await mutable.read();
  return isEqual(filled, [0, 1, 2, 3, 4, 5, 6]);
}

async function test2d(): Promise<boolean> {
  const size = [2, 3] as const;
  const mutable = root.createMutable(
    d.arrayOf(d.arrayOf(d.vec2u, size[1]), size[0]),
  );
  root.createGuardedComputePipeline((x, y) => {
    'use gpu';
    mutable.$[x][y] = d.vec2u(x, y);
  }).dispatchThreads(...size);
  const filled = await mutable.read();
  return isEqual(filled, [
    [d.vec2u(0, 0), d.vec2u(0, 1), d.vec2u(0, 2)],
    [d.vec2u(1, 0), d.vec2u(1, 1), d.vec2u(1, 2)],
  ]);
}

async function test3d(): Promise<boolean> {
  const size = [2, 1, 2] as const;
  const mutable = root.createMutable(
    d.arrayOf(
      d.arrayOf(d.arrayOf(d.vec3u, size[2]), size[1]),
      size[0],
    ),
  );
  root.createGuardedComputePipeline((x, y, z) => {
    'use gpu';
    mutable.$[x][y][z] = d.vec3u(x, y, z);
  }).dispatchThreads(...size);
  const filled = await mutable.read();
  return isEqual(filled, [
    [[d.vec3u(0, 0, 0), d.vec3u(0, 0, 1)]],
    [[d.vec3u(1, 0, 0), d.vec3u(1, 0, 1)]],
  ]);
}

async function testWorkgroupSize(): Promise<boolean> {
  const mutable = root.createMutable(d.atomic(d.u32));
  root.createGuardedComputePipeline((_x, _y, _z) => {
    'use gpu';
    std.atomicAdd(mutable.$, 1);
  }).dispatchThreads(4, 3, 2);
  const filled = await mutable.read();
  return isEqual(filled, 4 * 3 * 2);
}

async function testMultipleDispatches(): Promise<boolean> {
  const size = [7] as const;
  const mutable = root
    .createMutable(d.arrayOf(d.u32, size[0]), [0, 1, 2, 3, 4, 5, 6]);
  const test = root.createGuardedComputePipeline((x: number) => {
    'use gpu';
    mutable.$[x] *= 2;
  });
  test.dispatchThreads(6);
  test.dispatchThreads(2);
  test.dispatchThreads(4);
  const filled = await mutable.read();
  return isEqual(filled, [0, 1 * 8, 2 * 4, 3 * 4, 4 * 2, 5 * 2, 6 * 1]);
}

async function testDifferentBindGroups(): Promise<boolean> {
  const layout = tgpu.bindGroupLayout({
    buffer: { storage: d.arrayOf(d.u32), access: 'mutable' },
  });
  const buffer1 = root
    .createBuffer(d.arrayOf(d.u32, 3), [1, 2, 3]).$usage('storage');
  const buffer2 = root
    .createBuffer(d.arrayOf(d.u32, 4), [2, 4, 8, 16]).$usage('storage');
  const bindGroup1 = root.createBindGroup(layout, {
    buffer: buffer1,
  });
  const bindGroup2 = root.createBindGroup(layout, {
    buffer: buffer2,
  });

  const test = root.createGuardedComputePipeline(() => {
    'use gpu';
    for (let i = d.u32(); i < std.arrayLength(layout.$.buffer); i++) {
      layout.$.buffer[i] *= 2;
    }
  });

  test.with(bindGroup1).dispatchThreads();
  test.with(bindGroup2).dispatchThreads();

  const filled1 = await buffer1.read();
  const filled2 = await buffer2.read();
  return isEqual(filled1, [2, 4, 6]) && isEqual(filled2, [4, 8, 16, 32]);
}

async function testSlots(): Promise<boolean> {
  const result = root.createMutable(d.f32);
  const valueSlot = tgpu.slot(1);

  const main = () => {
    'use gpu';
    result.$ += valueSlot.$;
  };

  root.createGuardedComputePipeline(main).dispatchThreads(); // add 1
  root
    .with(valueSlot, 3)
    .createGuardedComputePipeline(main)
    .dispatchThreads(); // add 3

  return await result.read() === 4;
}

async function runTests(): Promise<boolean> {
  let result = true;
  result = await test0d() && result;
  result = await test1d() && result;
  result = await test2d() && result;
  result = await test3d() && result;
  result = await testWorkgroupSize() && result;
  result = await testMultipleDispatches() && result;
  result = await testDifferentBindGroups() && result;
  result = await testSlots() && result;
  return result;
}

const table = document.querySelector<HTMLDivElement>('.result');
if (!table) {
  throw new Error('Nowhere to display the results');
}
void runTests().then((result) => {
  table.innerText = `Tests ${result ? 'succeeded' : 'failed'}.`;
});

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
