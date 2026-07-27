import type { Snippet } from '../data/snippet.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { valueProxyHandler } from '../core/valueProxyUtils.ts';
import type { SelfResolvable, SimulationState } from '../types.ts';
import { getExecMode } from '../execMode.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';

/**
 * WARNING: This is an API that touches a lot of internals, and is not stable
 * (can change between patches). You should probably talk to the TypeGPU team
 * before using this, maybe we can provide a better public API for your use case.
 *
 * Defines additional properties on `value` (mutates it) that makes TypeGPU
 * understand how it should handle using .$ on that object. All dereferenceable
 * value must also be made resolvable (through the makeResolvable API).
 *
 * `value` can in particular be the prototype of a class, meaning all instances
 * of that class will be dereferenceable.
 */
export function makeDereferenceable<T extends SelfResolvable, TValue>(
  value: T,
  options: makeDereferenceable.Options<T, TValue>,
): T & { $: TValue } {
  Object.defineProperty(value, $gpuValueOf, {
    get() {
      if (options.codegenMode.get) {
        return options.codegenMode.get.apply(this);
      }

      // oxlint-disable-next-line typescript/no-this-alias
      const resource = this;
      const proxy = new Proxy(
        {
          [$internal]: true,
          get [$ownSnippet]() {
            // oxlint-disable-next-line typescript/no-non-null-assertion -- enforced on the type level
            return options.codegenMode.getBaseSnippet!.apply(resource, [proxy]);
          },
          [$resolve]: (ctx) => ctx.resolve(resource),
          toString: () => `${resource.toString()}.$`,
        },
        valueProxyHandler,
      ) as TValue;

      return proxy;
    },
  });

  Object.defineProperty(value, '$', {
    get() {
      const mode = getExecMode();

      if (mode.type === 'codegen') {
        return this[$gpuValueOf];
      }

      if (mode.type === 'simulate') {
        if (options.simulateMode?.get) {
          return options.simulateMode.get.apply(this, [mode]);
        }
        return options.normalMode.get.apply(this);
      }

      if (mode.type === 'normal') {
        return options.normalMode.get.apply(this);
      }

      return assertExhaustive(mode, 'makeDereferenceable.ts#$ (get)');
    },
    set(value: TValue) {
      const mode = getExecMode();

      if (mode.type === 'normal') {
        if (!options.normalMode.set) {
          throw new Error(`'${this.toString()}' cannot be set in normal mode`);
        }
        options.normalMode.set.apply(this, [value]);
        return;
      }

      if (mode.type === 'simulate') {
        if (options.simulateMode?.set) {
          options.simulateMode.set.apply(this, [mode, value]);
        } else if (options.normalMode.set) {
          // Falling back to the 'normal' set
          options.normalMode.set.apply(this, [value]);
        } else {
          throw new Error(`'${this.toString()}' cannot be set in simulate mode`);
        }
        return;
      }

      if (mode.type === 'codegen') {
        // The shader generator handles assignment, and does not defer to
        // whatever's being assigned to generate the shader code.
        throw new Error('Unreachable makeDerefenceable.ts#$ (set)');
      }

      return assertExhaustive(mode, 'makeDereferenceable.ts#$ (set)');
    },
  });

  return value as T & { $: TValue };
}

export namespace makeDereferenceable {
  export interface Options<T extends SelfResolvable, TValue> {
    normalMode: {
      get(this: T): TValue;
      set?(this: T, value: TValue): void;
    };
    codegenMode:
      | {
          get(this: T): TValue;
        }
      | {
          getBaseSnippet(this: T, trackingProxy: TValue): Snippet;
        };
    /** @deprecated 'simulate' mode is planned to be removed in the future */
    simulateMode?: {
      get?(this: T, state: SimulationState): TValue;
      set?(this: T, state: SimulationState, value: TValue): void;
    };
  }
}
