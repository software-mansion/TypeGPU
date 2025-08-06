import { getName, setName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';
import { schemaCloneWrapper, schemaDefaultWrapper } from './utils.ts';
import type { AnyWgslData, WgslStruct } from './wgslTypes.ts';

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
  // In the schema call, create and return a deep copy
  // by wrapping all the values in corresponding schema calls.
  const structSchema = (instanceProps?: TProps) =>
    Object.fromEntries(
      Object.entries(props).map(([key, schema]) => [
        key,
        instanceProps
          ? schemaCloneWrapper(schema, instanceProps[key])
          : schemaDefaultWrapper(schema),
      ]),
    );
  Object.setPrototypeOf(structSchema, WgslStructImpl);
  structSchema.propTypes = props;

  return structSchema as WgslStruct<TProps>;
}

export function builtinStruct<TProps extends Record<string, AnyWgslData>>(
  props: TProps,
  builtinName: string,
): WgslStruct<TProps> {
  const structSchema = struct(props);
  // This check makes sure that we set the builtin name on the particular struct - not the prototype.
  if (!Object.getOwnPropertySymbols(structSchema).includes($internal)) {
    Object.defineProperty(structSchema, $internal, {
      value: { builtinName },
    });
  } else {
    structSchema[$internal].builtinName = builtinName;
  }
  return structSchema;
}

// --------------
// Implementation
// --------------

const WgslStructImpl = {
  [$internal]: {
    builtinName: null,
  },
  type: 'struct',

  $name(label: string) {
    setName(this, label);
    return this;
  },

  toString(): string {
    return `struct:${getName(this) ?? '<unnamed>'}`;
  },
};
