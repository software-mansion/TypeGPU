import type { TgpuNamable } from '../namable';
import type {
  InferGPURecord,
  InferPartialRecord,
  InferRecord,
  MemIdentityRecord,
} from '../shared/repr';
import type { Prettify } from '../shared/utilityTypes';
import type { AnyWgslData, BaseData } from './wgslTypes';

// ----------
// Public API
// ----------

/**
 * Struct schema constructed via `d.struct` function.
 *
 * Responsible for handling reading and writing struct values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its members.
 */
export interface WgslStruct<
  TProps extends Record<string, BaseData> = Record<string, BaseData>,
> extends TgpuNamable {
  (props: InferRecord<TProps>): InferRecord<TProps>;
  readonly type: 'struct';
  readonly label?: string | undefined;
  readonly propTypes: TProps;
  /** Type-token, not available at runtime */
  readonly '~repr': Prettify<InferRecord<TProps>>;
  /** Type-token, not available at runtime */
  readonly '~gpuRepr': InferGPURecord<TProps>;
  /** Type-token, not available at runtime */
  readonly '~memIdent': WgslStruct<MemIdentityRecord<TProps>>;
  /** Type-token, not available at runtime */
  readonly '~reprPartial': Prettify<Partial<InferPartialRecord<TProps>>>;
}

// biome-ignore lint/suspicious/noExplicitAny: <we need the type to be broader than WgslStruct<Record<string, BaseWgslData>>
export type AnyWgslStruct = WgslStruct<any>;

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
): WgslStruct<Prettify<TProps>> {
  const struct = <T>(props: T) => props;
  Object.setPrototypeOf(struct, WgslStructImpl);
  struct.propTypes = props;

  return struct as unknown as WgslStruct<Prettify<TProps>>;
}

// --------------
// Implementation
// --------------

const WgslStructImpl = {
  type: 'struct',
  _label: undefined as string | undefined,

  get label(): string | undefined {
    return this._label;
  },

  $name(label: string) {
    this._label = label;
    return this;
  },

  toString(): string {
    return `struct:${this.label ?? '<unnamed>'}`;
  },
};
