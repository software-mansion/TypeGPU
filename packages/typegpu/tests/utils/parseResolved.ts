import { WeslStream } from 'wesl';
import type { TgpuResolveOptions } from '../../src/core/resolve/tgpuResolve.ts';
import tgpu from '../../src/index.ts';

export function parse(code: string): string {
  const stream = new WeslStream(code);
  const firstToken = stream.nextToken();
  if (firstToken === null) {
    return '';
  }

  let result = firstToken.text;
  let token = stream.nextToken();
  while (token !== null) {
    result += ` ${token.text}`;
    token = stream.nextToken();
  }
  return result;
}

export function parseResolved(
  resolvable: TgpuResolveOptions['externals'],
): string {
  const resolved = tgpu.resolve({
    externals: resolvable,
    names: 'strict',
  });

  try {
    return parse(resolved);
  } catch (e) {
    throw new Error(
      `Failed to parse the following: \n${resolved}\n\nCause:${
        String(e).substring(0, 128)
      }`,
    );
  }
}

/**
 * Just a shorthand for tgpu.resolve
 */
export function asWgsl(...values: unknown[]): string {
  return tgpu.resolve({
    // Arrays are objects with numeric keys if you thing about it hard enough
    externals: values as unknown as Record<string, object>,
    names: 'strict',
  });
}
