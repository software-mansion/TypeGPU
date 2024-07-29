export abstract class WgslResolvableBase {
  abstract typeInfo: string;
  public label = '<unnamed>';

  $name(label?: string | undefined) {
    this.label = label ?? '<unnamed>';
    return this;
  }

  toString(): string {
    throw new Error(
      'Use wgsl`...` when interpolating wgsl code. For console logging use the .toDebugRepr() method',
    );
  }

  toDebugRepr(): string {
    return `${this.typeInfo}: ${this.label}`;
  }
}