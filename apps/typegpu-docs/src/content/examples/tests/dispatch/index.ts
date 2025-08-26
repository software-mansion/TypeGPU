import tgpu, { dispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

function assertEqual(e1: unknown, e2: unknown) {
  if (Array.isArray(e1) && Array.isArray(e2)) {
    e1.forEach((elem, i) => assertEqual(elem, e2[i]));
    return;
  }
  if (e1 !== e2) {
    throw new Error(`${e1} and ${e2} are not equal.`);
  }
}

async function test1d() {
  const size = [7] as const;
  const mutable = root.createMutable(d.arrayOf(d.u32, size[0]));
  dispatch({
    root,
    size,
    callback: (x: number) => {
      'kernel';
      mutable.$[x] = x;
    },
  });
  const filled = await mutable.read();
  assertEqual(filled, [0, 1, 2, 3, 4, 5, 6]);
}

async function test2d() {
  const size = [2, 3] as const;
  const mutable = root.createMutable(
    d.arrayOf(d.arrayOf(d.vec2u, size[1]), size[0]),
  );
  dispatch({
    root,
    size,
    callback: (x, y) => {
      'kernel';
      mutable.$[x][y] = d.vec2u(x, y);
    },
  });
  const filled = await mutable.read();
  assertEqual(filled, [
    [d.vec2u(0, 0), d.vec2u(0, 1), d.vec2u(0, 2)],
    [d.vec2u(1, 0), d.vec2u(1, 1), d.vec2u(1, 2)],
  ]);
}

async function test3d() {
  const size = [2, 1, 2] as const;
  const mutable = root.createMutable(
    d.arrayOf(d.arrayOf(d.arrayOf(d.vec3u, size[2]), size[1]), size[0]),
  );
  dispatch({
    root,
    size,
    callback: (x, y, z) => {
      'kernel';
      mutable.$[x][y][z] = d.vec3u(x, y, z);
    },
  });
  const filled = await mutable.read();
  assertEqual(filled, [
    [[d.vec3u(0, 0, 0), d.vec3u(0, 0, 1)]],
    [[d.vec3u(1, 0, 0), d.vec3u(1, 0, 1)]],
  ]);
}

async function testWorkgroupSize() {
  const mutable = root.createMutable(d.arrayOf(d.u32, 12));
  dispatch({
    root,
    size: [5],
    callback: (x) => {
      'kernel';
      mutable.$[x] = x;
    },
    workgroupSize: [3],
  });
  const filled = await mutable.read();
  assertEqual(filled, [0, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0]);
}

async function runTests() {
  await test1d();
  await test2d();
  await test3d();
  await testWorkgroupSize();
}

const table = document.querySelector<HTMLDivElement>('.result');
if (!table) {
  throw new Error('Nowhere to display the results');
}
runTests().then(() => {
  table.innerText = 'Tests succeeded!';
}).catch((e) => {
  table.innerText = 'Tests failed.';
  console.log(e);
});

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
