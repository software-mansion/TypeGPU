import { parse } from 'tgpu-wgsl-parser';
import type { TgpuResolveOptions } from '../../src/core/resolve/tgpuResolve';
import tgpu from '../../src/experimental';

export function parseResolved(resolvable: TgpuResolveOptions['input']) {
  const resolved = tgpu.resolve({
    input: resolvable,
    names: 'strict',
  });

  try {
    return parse(resolved);
  } catch (e) {
    throw new Error(
      `Failed to parse the following: \n${resolved}\n\nCause:${String(e).substring(0, 128)}`,
    );
  }
}
