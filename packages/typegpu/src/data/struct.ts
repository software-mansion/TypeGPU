import { isValidProp } from '../nameRegistry.ts';
import { getName, setName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import { schemaCallWrapper } from './schemaCallWrapper.ts';
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
    if (!isValidProp(key)) {
      throw new Error(
        `Property key '${key}' is a reserved WGSL word. Choose a different name.`,
      );
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
    return this;
  },

  toString(): string {
    return `struct:${getName(this) ?? '<unnamed>'}`;
  },
};
