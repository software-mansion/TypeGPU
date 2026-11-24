import type { ShaderChunks } from '../artifact.ts';

/**
 * Splits WGSL after every top-level declaration (a `;` or `}` outside of braces and comments).
 * The pieces always concatenate back into the same text.
 *
 * The split doesn't have to land exactly on declarations, it only decides which pieces can be
 * shared between shaders. A cut in the wrong place (e.g. unbalanced braces) can only make
 * less of the code shared, never change the WGSL that gets joined back at runtime.
 */
function splitDeclarations(code: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      i = end === -1 ? code.length : end;
      continue;
    }
    if (char === '/' && code[i + 1] === '*') {
      // Block comments nest in WGSL
      let nesting = 1;
      for (i += 2; i < code.length && nesting > 0; i++) {
        if (code[i] === '/' && code[i + 1] === '*') {
          nesting++;
          i++;
        } else if (code[i] === '*' && code[i + 1] === '/') {
          nesting--;
          i++;
        }
      }
      i--;
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      // A stray `}` shouldn't keep every later declaration from being split
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && (char === ';' || char === '}')) {
      pieces.push(code.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < code.length) {
    pieces.push(code.slice(start));
  }
  return pieces;
}

/**
 * Variants of a shader share most of their declarations. Emits each distinct declaration
 * once and every shader as a list of indices into them, unless the lists make that larger
 * than emitting every shader in full.
 */
export function packShaders(shaders: string[]): string[] | ShaderChunks {
  const ids = new Map<string, number>();
  const chunks: string[] = [];
  const lists = shaders.map((code) =>
    splitDeclarations(code).map((chunk) => {
      let id = ids.get(chunk);
      if (id === undefined) {
        id = chunks.length;
        chunks.push(chunk);
        ids.set(chunk, id);
      }
      return id;
    }),
  );
  const packed: ShaderChunks = { chunks, shaders: lists };
  return JSON.stringify(packed).length < JSON.stringify(shaders).length ? packed : shaders;
}
