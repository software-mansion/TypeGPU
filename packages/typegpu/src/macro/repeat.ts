import type { Eventual, Tgpu } from '../types';
import { code } from '../wgslCode';
import { TgpuIdentifier } from '../wgslIdentifier';

export function repeat(
  count: Eventual<Tgpu>,
  snippet: Eventual<Tgpu | ((idx: Tgpu) => Tgpu)>,
): Tgpu;

export function repeat(
  count: Eventual<number>,
  snippet: Eventual<Tgpu | ((idx: number) => Tgpu)>,
): Tgpu;

export function repeat(
  count: Eventual<Tgpu>,
  snippet: Eventual<Tgpu | ((idx: number) => Tgpu) | ((idx: Tgpu) => Tgpu)>,
): Tgpu {
  return code`${(get) => {
    const countValue = get(count);
    const snippetValue = get(snippet);

    if (typeof countValue !== 'number') {
      const index = new TgpuIdentifier().$name('i');

      if (typeof snippetValue === 'function') {
        return code`
          for (var ${index} = 0; ${index} < ${countValue}; ${index} += 1) {
            ${snippetValue(index as unknown as number) /* silencing TypeScript with the cast */}
          }`;
      }

      return code`
        for (var ${index} = 0; ${index} < ${countValue}; ${index} += 1) {
          ${snippetValue}
        }`;
    }

    if (typeof snippetValue === 'function') {
      return code`${Array.from({ length: countValue }, (_, idx) => snippetValue(idx))}`;
    }

    return code`${Array.from({ length: countValue }, () => snippetValue)}`;
  }}`;
}
