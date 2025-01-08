import { parse } from 'tgpu-wgsl-parser';
import type { TgpuResolveOptions } from '../../src/core/resolve/tgpuResolve';
import tgpu from '../../src/experimental';

export function parseResolved(resolvable: TgpuResolveOptions['externals']) {
  const resolved = tgpu.resolve({
    externals: resolvable,
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
