import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const result = root.createMutable(d.i32, 0);

function run(callback: (input: { gid: d.v3u }) => undefined) {
  const computeRunTests = tgpu['~unstable']
    .computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(callback);

  const pipeline = root['~unstable']
    .withCompute(computeRunTests)
    .createPipeline();

  pipeline.dispatchWorkgroups(1);

  console.log(tgpu.resolve({ externals: { pipeline } }));
}

run(({ gid }) => {
  'kernel';
  console.log(gid.x + 10);
  // console.log(gid.x + 20);
});

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
