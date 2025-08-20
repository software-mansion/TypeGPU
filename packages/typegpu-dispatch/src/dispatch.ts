import tgpu, { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

export function dispatch2d(
  root: TgpuRoot,
  size: readonly [number, number],
  callback: (x: number, y: number) => void,
): void {
  const wrappedCallback = tgpu.fn([d.u32, d.u32])(callback);

  const mainCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [1, 1],
    in: { id: d.builtin.globalInvocationId },
  })(({ id }) => {
    // TODO: Early return for overshooting workgroup threads (if workgroup size > 1)
    wrappedCallback(id.x, id.y);
  });

  root['~unstable']
    .withCompute(mainCompute)
    .createPipeline()
    .dispatchWorkgroups(size[0], size[1]);
}
