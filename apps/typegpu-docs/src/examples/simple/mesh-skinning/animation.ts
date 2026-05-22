import { quat, vec3 } from 'wgpu-matrix';
import type { Animation, Quat, Vec3 } from './types.ts';

export interface NodeTransform {
  translation: Vec3;
  hasTranslation: boolean;
  rotation: Quat;
  hasRotation: boolean;
  scale: Vec3;
  hasScale: boolean;
}

export type NodeTransformState = NodeTransform[];

export function createNodeTransformState(nodeCount: number): NodeTransformState {
  return Array.from({ length: nodeCount }, () => ({
    translation: [0, 0, 0],
    hasTranslation: false,
    rotation: [0, 0, 0, 1],
    hasRotation: false,
    scale: [1, 1, 1],
    hasScale: false,
  }));
}

export function sampleAnimationInto(
  animation: Animation | undefined,
  time: number,
  transforms: NodeTransformState,
  touchedNodes: number[],
): NodeTransformState {
  for (const nodeIndex of touchedNodes) {
    const transform = transforms[nodeIndex];
    transform.hasTranslation = false;
    transform.hasRotation = false;
    transform.hasScale = false;
  }
  touchedNodes.length = 0;

  if (!animation || animation.duration <= 0) {
    return transforms;
  }

  const loopedTime = time % animation.duration;

  for (const channel of animation.channels) {
    const { input: times, output: values } = animation.samplers[channel.samplerIndex];
    const components = channel.targetPath === 'rotation' ? 4 : 3;

    let keyframeIndex = 0;
    while (keyframeIndex < times.length - 2 && loopedTime >= times[keyframeIndex + 1]) {
      keyframeIndex++;
    }

    const startTime = times[keyframeIndex];
    const endTime = times[keyframeIndex + 1];
    const alpha =
      endTime > startTime
        ? Math.max(0, Math.min(1, (loopedTime - startTime) / (endTime - startTime)))
        : 0;

    const start = keyframeIndex * components;
    const end = (keyframeIndex + 1) * components;

    const transform = transforms[channel.targetNode];
    if (!transform.hasTranslation && !transform.hasRotation && !transform.hasScale) {
      touchedNodes.push(channel.targetNode);
    }

    if (channel.targetPath === 'rotation') {
      quat.slerp(
        values.subarray(start, start + components),
        values.subarray(end, end + components),
        alpha,
        transform.rotation,
      );
      transform.hasRotation = true;
    } else if (channel.targetPath === 'translation') {
      vec3.lerp(
        values.subarray(start, start + components),
        values.subarray(end, end + components),
        alpha,
        transform.translation,
      );
      transform.hasTranslation = true;
    } else {
      vec3.lerp(
        values.subarray(start, start + components),
        values.subarray(end, end + components),
        alpha,
        transform.scale,
      );
      transform.hasScale = true;
    }
  }

  return transforms;
}
