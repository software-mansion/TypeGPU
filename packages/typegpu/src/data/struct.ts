import { WgslTypeError } from '../errors.ts';
import { validateProp } from '../nameUtils.ts';
import { getName, setName } from '../shared/meta.ts';
import { $gpuCallable, $gpuCallableStrictSignature, $internal } from '../shared/symbols.ts';
import { tryConvertSnippet } from '../tgsl/conversion.ts';
import { schemaCallWrapper } from './schemaCallWrapper.ts';
import { snip } from './snippet.ts';
import type { AnyWgslData, BaseData, WgslStruct } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Creates a struct schema that can be used to construct GPU buffers.
 * Ensures proper alignment and padding of properties (as opposed to a `d.unstruct` schema).
 * The order of members matches the passed in properties object.
 *
 * @example
 * const CircleStruct = d.struct({ radius: d.f32, pos: d.vec3f });
 *
 * @param props Record with `string` keys and `TgpuData` values,
 * each entry describing one struct member.
 */
export function struct<TProps extends Record<string, AnyWgslData>>(
  props: TProps,
): WgslStruct<TProps> {
  return INTERNAL_createStruct(props, false);
}

export function abstruct<TProps extends Record<string, AnyWgslData>>(
  props: TProps,
): WgslStruct<TProps> {
  return INTERNAL_createStruct(props, true);
}

// --------------
// Implementation
// --------------

export function INTERNAL_createStruct<TProps extends Record<string, BaseData>>(
  props: TProps,
  isAbstruct: boolean,
): WgslStruct<TProps> {
  Object.keys(props).forEach((key) => {
    const result = validateProp(key);
    if (!result.success) {
      throw new Error(`Invalid property key '${key}'${result.error ? `: ${result.error}` : ''}`);
    }
  });

  // In the schema call, create and return a deep copy
  // by wrapping all the values in corresponding schema calls.
  const structSchema = (instanceProps?: TProps) =>
    Object.fromEntries(
      Object.entries(props).map(([key, schema]) => [
        key,
        schemaCallWrapper(schema, instanceProps?.[key]),
      ]),
    );

  Object.setPrototypeOf(structSchema, WgslStructImpl);
  structSchema.propTypes = props;
  Object.defineProperty(structSchema, $internal, {
    value: {
      isAbstruct,
    },
  });

  return structSchema as WgslStruct<TProps>;
}

const WgslStructImpl = {
  type: 'struct',

  $name(label: string) {
    setName(this, label);
    return this as WgslStruct;
  },

  toString(): string {
    return `struct:${getName(this) ?? '<unnamed>'}`;
  },

  get [$gpuCallableStrictSignature]() {
    return { argTypes: [this as WgslStruct], returnType: this as WgslStruct };
  },

  [$gpuCallable](ctx, args) {
    if (args.length > 1) {
      throw new WgslTypeError('Struct schemas should always be called with at most 1 argument');
    }

    // No arguments `Struct()`, resolve struct name and return.
    if (!args[0]) {
      // The schema becomes the data type.
      return ctx.gen.typeInstantiation(this as WgslStruct, []);
    }

    const arg = tryConvertSnippet(ctx, args[0], this as WgslStruct);

    // Either `Struct({ x: 1, y: 2 })`, or `Struct(otherStruct)`.
    // In both cases, we just let the argument resolve everything.
    return snip(
      ctx.resolveSnippet(arg).value,
      this as WgslStruct,
      // A new struct, so not a reference.
      /* origin */ 'runtime',
      arg.possibleSideEffects,
    );
  },
} satisfies Partial<WgslStruct>;
