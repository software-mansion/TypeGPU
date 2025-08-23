import type { TgpuQuerySet, TgpuRoot } from 'typegpu';

export function modelInference(
  root: TgpuRoot,
  neuralNetwork: undefined,
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): void {
}
