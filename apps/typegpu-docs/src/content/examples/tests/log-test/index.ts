import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const result = root.createMutable(d.i32, 0);

function run(callback: () => undefined) {
  const computeRunTests = tgpu['~unstable']
    .computeFn({ workgroupSize: [1] })(callback);

  const pipeline = root['~unstable']
    .withCompute(computeRunTests)
    .createPipeline();

  pipeline.dispatchWorkgroups(1);

  console.log(tgpu.resolve({ externals: { pipeline } }));
}

run(() => {
  'kernel';
  console.log(126);
});

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
