import { getName } from '../shared/meta.ts';
import { $internal } from '../shared/symbols.ts';

export class AutoStruct {
  // Prototype properties
  declare [$internal]: true;
  declare type: 'auto-struct';

  readonly validProps: readonly string[];
  readonly usedProps: Set<string>;

  constructor(validProps: readonly string[]) {
    this.validProps = validProps;
    this.usedProps = new Set();
  }

  registerUsedProp(name: string): void {
    if (!this.validProps.includes(name)) {
      throw new Error(`Property '${name}' isn't a valid shader input.`);
    }
    this.usedProps.add(name);
  }

  toString(): string {
    return `auto-struct:${getName(this) ?? '<unnamed>'}`;
  }
}

AutoStruct.prototype[$internal] = true;
AutoStruct.prototype.type = 'auto-struct';
