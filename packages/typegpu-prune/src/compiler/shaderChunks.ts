import type { ShaderChunks } from '../artifact.ts';

/**
 * Splits WGSL after every top-level declaration (a `;` or `}` outside of braces).
 * The pieces always concatenate back into the same text.
 */
function splitDeclarations(code: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
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
