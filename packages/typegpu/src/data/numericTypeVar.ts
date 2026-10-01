import { $internal, $repr } from '../shared/symbols.ts';
import type { BaseData, F16, F32, I32, U32 } from './wgslTypes.ts';

export type CollapsedNumericType = F32 | F16 | I32 | U32;

let nextTypeVarId = 0;

/**
 * A numeric type that hasn't been decided yet. Variables initialized with a whole-number
 * literal (e.g. `let i = 0;`) get one of these when float literals are preferred. The type
 * stays in a "superposition" (behaving like an abstract int) until a use site collapses it,
 * e.g. index access collapses it to `i32`, and mixing it with an `f32` collapses it to `f32`.
 * Type variables that are still undecided at the end of a function default to `f32`.
 *
 * Type variables form a union-find structure, so that variables initialized from one another
 * collapse together.
 */
export class NumericTypeVar implements BaseData {
  readonly [$internal] = {};
  declare readonly [$repr]: number;
  readonly type = 'abstractInt';
  readonly id: number;

  #parent: NumericTypeVar | undefined;
  #collapsed: CollapsedNumericType | undefined;

  constructor() {
    this.id = nextTypeVarId++;
  }

  get root(): NumericTypeVar {
    return this.#parent ? this.#parent.root : this;
  }

  get collapsed(): CollapsedNumericType | undefined {
    return this.root.#collapsed;
  }

  collapse(type: CollapsedNumericType): CollapsedNumericType {
    const root = this.root;
    if (!root.#collapsed) {
      root.#collapsed = type;
    }
    return root.#collapsed;
  }

  /**
   * Links two undecided type variables, so that collapsing one collapses the other.
   */
  union(other: NumericTypeVar): void {
    const a = this.root;
    const b = other.root;
    if (a === b) {
      return;
    }
    if (a.#collapsed && !b.#collapsed) {
      b.collapse(a.#collapsed);
      return;
    }
    if (b.#collapsed && !a.#collapsed) {
      a.collapse(b.#collapsed);
      return;
    }
    b.#parent = a;
  }

  toString() {
    const collapsed = this.collapsed;
    return collapsed ? collapsed.type : `numeric?${this.root.id}`;
  }
}

export function isNumericTypeVar(value: unknown): value is NumericTypeVar {
  return value instanceof NumericTypeVar;
}

/**
 * Returns the collapsed type if the type variable has been decided, or the root
 * type variable if it hasn't. Leaves other types as is.
 */
export function resolveTypeVar<T>(type: T): T | NumericTypeVar | CollapsedNumericType {
  if (type instanceof NumericTypeVar) {
    return type.collapsed ?? type.root;
  }
  return type;
}
