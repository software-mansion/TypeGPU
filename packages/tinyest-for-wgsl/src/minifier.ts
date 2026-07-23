import type { Minifier } from './types.ts';

export class MinifierNullImpl implements Minifier {
  minify(name: string): string {
    return name;
  }
  getIfMinified(name: string) {
    return name;
    // TODO: reconsider, this may backfire
  }
}

/**
 * Generates all strings consisting of lowercase letters of the given length.
 */
function* combinationGenerator(length: number): Generator<string> {
  if (length === 0) {
    yield '';
    return;
  }

  for (let i = 97 /* ASCII a */; i <= 122 /* ASCII z */; i++) {
    for (const name of combinationGenerator(length - 1)) {
      yield `${String.fromCharCode(i)}${name}`;
    }
  }
}

/**
 * Generates fresh minified names, avoids forbidden tokens.
 */
function* freshNameGenerator(): Generator<string> {
  for (let i = 1; i <= 4; i++) {
    for (const name of combinationGenerator(i)) {
      if (!bannedTokens.has(name)) {
        yield name;
      }
    }
  }
  throw new Error('Too many variable names!');
}

export class MinifierImpl implements Minifier {
  #nameMap: Map<string, string> = new Map();
  #nameGenerator: Generator<string> = freshNameGenerator();

  #generateFreshName(): string {
    return this.#nameGenerator.next().value;
  }

  minify(name: string): string {
    let minifiedName = this.#nameMap.get(name);
    if (!minifiedName) {
      minifiedName = this.#generateFreshName();
      this.#nameMap.set(name, minifiedName);
    }

    return minifiedName;
  }

  getIfMinified(name: string) {
    return this.#nameMap.get(name);
  }
}

export const bannedTokens = new Set([
  'case',
  'else',
  'fn',
  'for',
  'if',
  'let',
  'loop',
  'true',
  'var',
  'NULL',
  'Self',
  'as',
  'asm',
  'auto',
  'cast',
  'do',
  'enum',
  'from',
  'get',
  'goto',
  'impl',
  'lowp',
  'meta',
  'mod',
  'move',
  'mut',
  'new',
  'nil',
  'null',
  'of',
  'pass',
  'priv',
  'pub',
  'ref',
  'self',
  'set',
  'std',
  'this',
  'try',
  'type',
  'use',
  'wgsl',
  'with',
]);
