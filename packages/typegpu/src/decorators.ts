import { ResolvableToStringError } from './errors';
import type { ResolutionCtx, WgslNamable, WgslResolvable } from './types';

export const namable = <T extends object>(object: T) => {
  let _label: string | undefined;

  return Object.defineProperty(
    Object.assign(object, {
      $name(label?: string | undefined) {
        _label = label;
        return this;
      },
    }),
    'label',
    {
      get() {
        return _label;
      },
    },
  ) as T & WgslNamable;
};

export const resolvable = <
  T extends object & {
    resolve: (ctx: ResolutionCtx) => string;
    [others: string]: unknown;
  },
>(
  options: { typeInfo: string },
  object: T,
) => {
  return Object.assign(
    'debugRepr' in object
      ? object
      : Object.defineProperty(object, 'debugRepr', {
          get(): string {
            return `${options.typeInfo}:${'label' in this ? this.label ?? '<unnamed>' : '<unnamed>'}`;
          },
        }),
    {
      toString() {
        throw new ResolvableToStringError(
          this as unknown as { debugRepr: string },
        );
      },
    },
  ) as T & {
    readonly debugRepr: string;
  } satisfies WgslResolvable;
};
