import { stitch } from '../core/resolve/stitch.ts';
import { bool, f16, f32, i32, u32 } from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import type { Origin, ResolvedSnippet, Snippet } from '../data/snippet.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../data/vector.ts';
import { isVec, type BaseData } from '../data/wgslTypes.ts';
import { invariant } from '../errors.ts';
import { $comptimeValueOf, $internal, $resolve } from '../shared/symbols.ts';
import {
  asComptime,
  type ComptimeValue,
  type ResolutionCtx,
  type SelfResolvable,
  type WithComptimeValue,
} from '../types.ts';

type SwizzleableType = 'f' | 'h' | 'i' | 'u' | 'b';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<SwizzleableType, Record<SwizzleLength, BaseData>> = {
  f: {
    1: f32,
    2: vec2f,
    3: vec3f,
    4: vec4f,
  },
  h: {
    1: f16,
    2: vec2h,
    3: vec3h,
    4: vec4h,
  },
  i: {
    1: i32,
    2: vec2i,
    3: vec3i,
    4: vec4i,
  },
  u: {
    1: u32,
    2: vec2u,
    3: vec3u,
    4: vec4u,
  },
  b: {
    1: bool,
    2: vec2b,
    3: vec3b,
    4: vec4b,
  },
} as const;

/**
 * Intermediate representation for vector swizzle access.
 * Vector swizzles create a new vector unless they are assigned to.
 */
export class Swizzle implements SelfResolvable, WithComptimeValue {
  readonly [$internal] = true;
  readonly base: Snippet;
  readonly components: string;
  readonly dataType: BaseData;
  /**
   * This origin only applies when swizzle is NOT assigned to.
   * When assigned to, {@link base}'s origin should be checked instead.
   */
  readonly origin: Origin;

  constructor(base: Snippet, components: string | number) {
    this.base = base;

    if (typeof components === 'string') {
      this.components = components;
    } else {
      const component = 'xyzw'[components];
      if (!component) {
        throw new Error(`Cannot index vector with '${components}'.`);
      }
      this.components = component;
    }

    const baseDataType = base.dataType;
    invariant(isVec(baseDataType));
    const swizzleTypeChar = baseDataType.type.includes('bool')
      ? 'b'
      : (baseDataType.type[4] as SwizzleableType);
    this.dataType = swizzleLenToType[swizzleTypeChar][this.components.length as SwizzleLength];

    this.origin =
      this.components.length === 1 // special case, as `vec.x` can have its address taken, unlike `vec.xy`
        ? base.origin
        : base.origin === 'constant' || base.origin === 'constant-immutable-def'
          ? 'constant'
          : 'runtime';
  }

  toString(): string {
    return 'swizzle';
  }

  [$comptimeValueOf](): ComptimeValue {
    const baseComptime = asComptime(this.base);
    if (baseComptime) {
      return {
        comptime: true,
        value: (baseComptime.value as Record<string, unknown>)[this.components],
      };
    }
    return { comptime: false };
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const comptime = this[$comptimeValueOf]();
    if (comptime.comptime) {
      return ctx.resolveSnippet(
        snip(comptime.value, this.dataType, this.origin, this.base.possibleSideEffects),
      );
    }
    return ctx.resolveSnippet(
      snip(
        stitch`${this.base}.${this.components}`,
        this.dataType,
        this.origin,
        this.base.possibleSideEffects,
      ),
    );
  }
}

export function isValidSwizzle(prop: string): boolean {
  return prop.length >= 1 && prop.length <= 4 && /^[xyzw]+$|^[rgba]+$/.test(prop);
}
