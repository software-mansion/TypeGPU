import { Schema } from 'typed-binary';
import type { WgslNamable, WgslResolvable } from '../types';

export abstract class WgslSchema<T>
  extends Schema<T>
  implements WgslNamable, Omit<WgslResolvable, 'resolve'>
{
  abstract readonly typeInfo: string;
  private _label: string | undefined;

  get label() {
    return this._label;
  }

  $name(label?: string | undefined) {
    this._label = label;
    return this;
  }

  toString(): string {
    throw new Error(
      'Use wgsl`...` when interpolating wgsl code. For console logging use the debugRepr property',
    );
  }

  get debugRepr(): string {
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}`;
  }
}
