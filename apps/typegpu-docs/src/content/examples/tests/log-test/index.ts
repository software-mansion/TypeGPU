import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

function run(callback: (input: { gid: d.v3u }) => undefined, size: number) {
  const computeRunTests = tgpu['~unstable']
    .computeFn({
      workgroupSize: [1],
      in: { gid: d.builtin.globalInvocationId },
    })(callback);

  const pipeline = root['~unstable']
    .withCompute(computeRunTests)
    .createPipeline();

  pipeline.dispatchWorkgroups(size);

  console.log(tgpu.resolve({ externals: { pipeline } }));
}

run(({ gid }) => {
  'kernel';
  console.log(gid.x + 10);
  console.log(gid.add(1).mul(3));
}, 2);

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
