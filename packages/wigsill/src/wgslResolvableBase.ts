import { ResolvableToStringError } from './errors';

export abstract class WgslResolvableBase {
  abstract typeInfo: string;
  public label: string | undefined;

  $name(label?: string | undefined) {
    this.label = label;
    return this;
  }

  toString(): string {
    throw new ResolvableToStringError(this);
  }

  get debugRepr(): string {
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}`;
  }
}
