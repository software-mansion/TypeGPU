import type { Animation } from './types.ts';
import { lerp, type Quat, slerp, type Vec3 } from './math.ts';

export type NodeTransform = {
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
};

export const sampleAnimation = (
  animation: Animation,
  time: number,
): Map<number, NodeTransform> => {
  const transforms = new Map<number, NodeTransform>();
  const loopedTime = time % animation.duration;

  for (const channel of animation.channels) {
    const { input: times, output: values } =
      animation.samplers[channel.samplerIndex];
    const components = channel.targetPath === 'rotation' ? 4 : 3;

    let i = 0;
    while (i < times.length - 2 && loopedTime >= times[i + 1]) {
      i++;
    }

    const t0 = times[i];
    const t1 = times[i + 1];
    const alpha = t1 > t0
      ? Math.max(0, Math.min(1, (loopedTime - t0) / (t1 - t0)))
      : 0;

    const start = i * components;
    const end = (i + 1) * components;
    const v0 = Array.from(values.slice(start, start + components));
    const v1 = Array.from(values.slice(end, end + components));

    const result = channel.targetPath === 'rotation'
      ? slerp(v0 as Quat, v1 as Quat, alpha)
      : lerp(v0, v1, alpha);

    if (!transforms.has(channel.targetNode)) {
      transforms.set(channel.targetNode, {});
    }
    const t = transforms.get(channel.targetNode);
    if (!t) {
      continue;
    }
    if (channel.targetPath === 'rotation') {
      t.rotation = result as Quat;
    } else if (channel.targetPath === 'translation') {
      t.translation = result as Vec3;
    } else {
      t.scale = result as Vec3;
    }
  }

  return transforms;
};
