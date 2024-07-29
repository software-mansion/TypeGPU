import { Schema } from 'typed-binary';

export abstract class WgslSchema<T> extends Schema<T> {
  abstract typeInfo: string;
  public label: string | undefined;

  $name(label?: string | undefined) {
    this.label = label;
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
