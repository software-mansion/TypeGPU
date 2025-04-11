import { WeslStream } from 'wesl';
import tgpu from '../../src';
import type { TgpuResolveOptions } from '../../src/core/resolve/tgpuResolve';

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
      `Failed to parse the following: \n${resolved}\n\nCause:${String(e).substring(0, 128)}`,
    );
  }
}
