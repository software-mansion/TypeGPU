// oxlint-disable typescript/no-explicit-any, unicorn/no-new-array -- measurement scripts working with untyped AST/metadata payloads
/**
 * Runtime readers for the candidate metadata formats (see formats.ts).
 * Each turns what the helper/wrapper registered into the normalized shape TypeGPU consumes:
 * `{ params: FuncParameter[], body: Block, externals: Record<string, unknown> (getters), name }`.
 */

type Thunks = Record<string, () => unknown>;
type Param = { type: 'i'; name: string } | { type: 'd'; props: { name: string; alias: string }[] };

export interface Normalized {
  params: Param[];
  body: unknown;
  externals: Record<string, unknown>;
  name: string | undefined;
}

// Same as typegpu's normalizeExternalsV2
function getters(externals: Thunks): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(externals)) {
    Object.defineProperty(result, key, { get: value, enumerable: true });
  }
  return result;
}

function slimParams(params: (string | [string, string][])[]): Param[] {
  return params.map((p) =>
    typeof p === 'string'
      ? { type: 'i', name: p }
      : { type: 'd', props: p.map(([name, alias]) => ({ name, alias })) },
  );
}

/** v2: `{ v, name, ast: { params, body }, externals }` */
export function readV2(raw: any): Normalized {
  return {
    params: raw.ast.params,
    body: raw.ast.body,
    externals: getters(raw.externals),
    name: raw.name,
  };
}

/** A: helper registers `[meta]` (v2 object) */
export const readA = (raw: any[]) => readV2(raw[0]);

/** B/C: helper registers `[params, stmts, externals, name?]` */
export function readC(raw: any[]): Normalized {
  return {
    params: slimParams(raw[0]),
    body: [0, raw[1]],
    externals: getters(raw[2]),
    name: raw[3],
  };
}

/** D: helper registers `[json, externals, name?]` */
export function readD(raw: any[]): Normalized {
  const [params, stmts] = JSON.parse(raw[0]);
  return {
    params: slimParams(params),
    body: [0, stmts],
    externals: getters(raw[1]),
    name: raw[2],
  };
}

// --- G: prefix encoding ---------------------------------------------------------------------

let src = '';
let pos = 0;

function next(): string {
  if (src.charCodeAt(pos) === 34 /* " */) {
    // Quoted token, find the closing quote (skipping escapes)
    let end = pos + 1;
    while (src.charCodeAt(end) !== 34) {
      end += src.charCodeAt(end) === 92 /* \ */ ? 2 : 1;
    }
    const tok = src.slice(pos, end + 1);
    pos = end + 2;
    return JSON.parse(tok);
  }
  let end = src.indexOf(',', pos);
  if (end === -1) end = src.length;
  const tok = src.slice(pos, end);
  pos = end + 1;
  return tok;
}

function peekAbsent(): boolean {
  if (src.charCodeAt(pos) === 126 /* ~ */) {
    pos += 2;
    return true;
  }
  return false;
}

function list(n: number): unknown[] {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = node();
  return out;
}

function node(): unknown {
  const quoted = src.charCodeAt(pos) === 34;
  const tok = next();
  if (quoted) return tok;
  const c = tok.charCodeAt(0);
  if (c === 35 /* # */) {
    const v = tok.slice(1);
    return v === 'true' ? true : v === 'false' ? false : Number(v);
  }
  if (c < 48 || c > 57) return tok; // identifier
  // Structural: leading digits are the tag, the rest is an operator or `.count`
  let j = 1;
  while (j < tok.length && tok.charCodeAt(j) >= 48 && tok.charCodeAt(j) <= 57) j++;
  const t = j === tok.length ? Number(tok) : Number(tok.slice(0, j));
  const rest = tok.slice(j);
  switch (t) {
    case 0:
      return [0, list(Number(rest.slice(1)))];
    case 100:
      return [100, list(Number(rest.slice(1)))];
    case 1:
    case 2:
    case 3: {
      const l = node();
      return [t, l, rest, node()];
    }
    case 4:
    case 101:
    case 102:
      return [t, rest, node()];
    case 6: {
      const callee = node();
      return [6, callee, list(Number(rest.slice(1)))];
    }
    case 7: {
      const o = node();
      return [7, o, next()];
    }
    case 8:
    case 15: {
      const a = node();
      return [t, a, node()];
    }
    case 10:
      return peekAbsent() ? [10] : [10, node()];
    case 11: {
      const cond = node();
      const then = node();
      return peekAbsent() ? [11, cond, then] : [11, cond, then, node()];
    }
    case 12:
    case 13: {
      const name = next();
      return peekAbsent() ? [t, name] : [t, name, node()];
    }
    case 14: {
      const init = peekAbsent() ? null : node();
      const cond = peekAbsent() ? null : node();
      const update = peekAbsent() ? null : node();
      return [14, init, cond, update, node()];
    }
    case 18:
    case 105: {
      const a = node();
      const b = node();
      return [t, a, b, node()];
    }
    case 19: {
      const disc = node();
      const cases = [];
      for (let i = Number(rest.slice(1)); i > 0; i--) {
        const test = peekAbsent() ? null : node();
        cases.push([test, list(Number(next()))]);
      }
      return [19, disc, cases];
    }
    case 104: {
      if (rest[0] === 'a') {
        const props = [];
        for (let i = Number(rest.slice(1)); i > 0; i--) {
          const k = node();
          const v = node();
          props.push([k, v, next() === '#true']);
        }
        return [104, props];
      }
      const props: Record<string, unknown> = {};
      for (let i = Number(rest.slice(1)); i > 0; i--) {
        const k = next();
        props[k] = node();
      }
      return [104, props];
    }
    case 103:
      return [103, next()];
    case 9:
      return [9, next()];
    default:
      return [t]; // continue, break, null
  }
}

function decodeG(str: string): { params: Param[]; body: unknown } {
  src = str;
  pos = 0;
  const params: Param[] = [];
  for (let i = Number(next()); i > 0; i--) {
    const tok = next();
    if (tok === '#d') {
      const props = [];
      for (let k = Number(next()); k > 0; k--) props.push({ name: next(), alias: next() });
      params.push({ type: 'd', props });
    } else {
      params.push({ type: 'i', name: tok });
    }
  }
  return { params, body: node() };
}

/** G: helper registers `[encoded, externals, name?]` */
export function readG(raw: any[]): Normalized {
  const { params, body } = decodeG(raw[0]);
  return { params, body, externals: getters(raw[1]), name: raw[2] };
}

// --- G2: prefix encoding with single-char tags -------------------------------------------------

/** Reads the token at `pos` (unquoted), moving past the following comma */
function tok(): string {
  let end = src.indexOf(',', pos);
  if (end === -1) end = src.length;
  const t = src.slice(pos, end);
  pos = end + 1;
  return t;
}

/** Reads the rest of the current structural token (after its 1-char tag) */
function rest(): string {
  pos++;
  return tok();
}

function name(): string {
  return src.charCodeAt(pos) === 34 ? next() : tok();
}

function opt2(): unknown {
  if (src.charCodeAt(pos) === 126 /* ~ */) {
    pos += 2;
    return undefined;
  }
  return node2();
}

function list2(n: number): unknown[] {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = node2();
  return out;
}

function node2(): unknown {
  switch (src.charCodeAt(pos)) {
    case 34 /* " */:
      return next();
    case 35 /* # */: {
      const v = rest();
      return v === 'true' ? true : v === 'false' ? false : Number(v);
    }
    case 123 /* { */:
      return [0, list2(Number(rest()))];
    case 93 /* ] */:
      return [100, list2(Number(rest()))];
    case 40 /* ( */: {
      const op = rest();
      const l = node2();
      return [1, l, op, node2()];
    }
    case 61 /* = */: {
      const op = rest();
      const l = node2();
      return [2, l, op, node2()];
    }
    case 38 /* & */: {
      const op = rest();
      const l = node2();
      return [3, l, op, node2()];
    }
    case 33 /* ! */: {
      const op = rest();
      return [4, op, node2()];
    }
    case 43 /* + */: {
      const op = rest();
      return [101, op, node2()];
    }
    case 45 /* - */: {
      const op = rest();
      return [102, op, node2()];
    }
    case 64 /* @ */: {
      const n = Number(rest());
      const callee = node2();
      return [6, callee, list2(n)];
    }
    case 46 /* . */: {
      pos += 2;
      const o = node2();
      return [7, o, name()];
    }
    case 91 /* [ */: {
      pos += 2;
      const o = node2();
      return [8, o, node2()];
    }
    case 42 /* * */: {
      pos += 2;
      const c = node2();
      return [15, c, node2()];
    }
    case 94 /* ^ */: {
      pos += 2;
      const v = opt2();
      return v === undefined ? [10] : [10, v];
    }
    case 63 /* ? */: {
      pos += 2;
      const cond = node2();
      const then = node2();
      const alt = opt2();
      return alt === undefined ? [11, cond, then] : [11, cond, then, alt];
    }
    case 59 /* ; */:
    case 58 /* : */: {
      const t = src.charCodeAt(pos) === 59 ? 12 : 13;
      pos += 2;
      const id = name();
      const init = opt2();
      return init === undefined ? [t, id] : [t, id, init];
    }
    case 37 /* % */: {
      pos += 2;
      const init = opt2() ?? null;
      const cond = opt2() ?? null;
      const update = opt2() ?? null;
      return [14, init, cond, update, node2()];
    }
    case 47 /* / */: {
      pos += 2;
      const l = node2();
      const r = node2();
      return [18, l, r, node2()];
    }
    case 41 /* ) */: {
      pos += 2;
      const a = node2();
      const b = node2();
      return [105, a, b, node2()];
    }
    case 124 /* | */: {
      const n = Number(rest());
      const disc = node2();
      const cases = [];
      for (let i = 0; i < n; i++) {
        const test = opt2() ?? null;
        cases.push([test, list2(Number(tok()))]);
      }
      return [19, disc, cases];
    }
    case 125 /* } */: {
      const r = rest();
      if (r.charCodeAt(0) === 97 /* a */) {
        const props = [];
        for (let i = Number(r.slice(1)); i > 0; i--) {
          const k = node2();
          const v = node2();
          props.push([k, v, tok() === '#true']);
        }
        return [104, props];
      }
      const props: Record<string, unknown> = {};
      for (let i = Number(r); i > 0; i--) {
        const k = name();
        props[k] = node2();
      }
      return [104, props];
    }
    case 96 /* ` */:
      pos += 2;
      return [103, next()];
    case 57 /* 9 */:
      pos += 2;
      return [9, name()];
    case 55 /* 7 */:
      pos += 2;
      return [16];
    case 56 /* 8 */:
      pos += 2;
      return [17];
    case 54 /* 6 */:
      pos += 2;
      return [106];
    default:
      return tok(); // identifier
  }
}

function decodeG2(str: string): { params: Param[]; body: unknown } {
  src = str;
  pos = 0;
  const params: Param[] = [];
  for (let i = Number(tok()); i > 0; i--) {
    if (src.startsWith('#d,', pos)) {
      pos += 3;
      const props = [];
      for (let k = Number(tok()); k > 0; k--) props.push({ name: name(), alias: name() });
      params.push({ type: 'd', props });
    } else {
      params.push({ type: 'i', name: name() });
    }
  }
  return { params, body: node2() };
}

/** G2: helper registers `[encoded, externals, name?]` */
export function readG2(raw: any[]): Normalized {
  const { params, body } = decodeG2(raw[0]);
  return { params, body, externals: getters(raw[1]), name: raw[2] };
}

export const READERS: Record<string, (raw: any) => Normalized> = {
  'current (v2)': readV2,
  'v2, impl not parenthesized': readV2,
  "D': D, numbers stay nodes": readD,
  'A: shared helper': readA,
  'B: A + slim fields': readC,
  'C: B + numbers inline': readC,
  'D: C + JSON string': readD,
  'G: prefix-encoded string': readG,
  'G2: prefix, 1-char tags': readG2,
};
