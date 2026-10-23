import type { AnyNode } from 'tinyest';
import { isSnippet, type Snippet } from '../data/snippet.ts';
import { getResolutionCtx } from '../execMode.ts';
import { getSourceNode } from './stringifySnippet.ts';
import { ResolutionError } from 'typegpu';
import { EVAL_ALLOWED_IN_ENV } from '../data/compiledIO.ts';
import { SOURCE_MAP } from '../shared/env.ts';

/**
 * Throws an error that also includes a source map (if it is available).
 */
// TODO: replace 2 more cases with this
export function fail(
  item: Snippet | AnyNode,
  reason: string,
  suggestions?: string | string[],
): never {
  let message = reason;
  if (typeof suggestions === 'string') {
    message += `\n-----\n`;
    message += suggestions;
    message += `\n-----`;
  }
  // TODO: array

  const ctx = getResolutionCtx();
  const node = isSnippet(item) ? getSourceNode(item) : item;
  const source = node !== undefined ? ctx?.sourceMap.get(node) : undefined;

  const stack = getStackTrace(source?.file, source?.location[0], source?.location[1]);
  const location = SOURCE_MAP
    ? `${source?.file}:${source?.location[0]}:${source?.location[1]}\n`
    : ``;

  const error = new ResolutionError(`${location}${message}`, [], source);
  if (stack) {
    error.stack = stack;
  }
  throw error;
}

// TODO: deslopify
function getStackTrace(
  file: string | undefined,
  line: number | undefined,
  column: number | undefined,
) {
  if (file === undefined || line === undefined || column === undefined) {
    return undefined;
  }
  if (!EVAL_ALLOWED_IN_ENV) {
    return undefined;
  }

  // TODO: check ${window.location.origin}
  const fileUrl = `${file}?raw`;

  const sourceMap = {
    version: 3,
    file: 'fakeErrorFile.js',
    sources: [fileUrl],
    mappings: `AA${toVLQ(/* line */ line)}${toVLQ(/* char */ column)}`,
  };

  const base64Map = btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(sourceMap))),
  );

  const errFile = `\
throw new Error(':c');
//# sourceMappingURL=data:application/json;base64,${base64Map}
//# sourceURL=${file}
`;
  try {
    (0, eval)(errFile);
  } catch (err) {
    if (err instanceof Error) {
      return err.stack;
    }
  }
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes a number as a Base64 VLQ, as used in source map `mappings`.
 */
function toVLQ(value: number): string {
  // The sign is stored in the least significant bit
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let result = '';
  do {
    let digit = vlq & 0b11111;
    vlq >>>= 5;
    if (vlq > 0) {
      // Continuation bit
      digit |= 0b100000;
    }
    result += BASE64_CHARS[digit];
  } while (vlq > 0);
  return result;
}
