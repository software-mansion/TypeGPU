import { ResolvableToStringError } from './errors';
import type { WgslNamable, WgslResolvable } from './types';

export abstract class WgslResolvableBase
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
    throw new ResolvableToStringError(this);
  }

  get debugRepr(): string {
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}`;
  }
}
