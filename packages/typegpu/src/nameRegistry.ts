import type { TgpuResolvable } from './types';

export interface NameRegistry {
  nameFor(item: TgpuResolvable): string;
}

export class RandomNameRegistry implements NameRegistry {
  private lastUniqueId = 0;
  private names = new WeakMap<TgpuResolvable, string>();

  nameFor(item: TgpuResolvable) {
    let name = this.names.get(item);

    if (name === undefined) {
      // creating sanitized name
      let label: string;
      if (item.label) {
        label = item.label.replaceAll(/\s/g, '_'); // whitespace -> _
        label = label.replaceAll(/[^\w\d]/g, ''); // removing illegal characters
      } else {
        label = 'item';
      }
      name = `${label}_${this.lastUniqueId++}`;
      this.names.set(item, name);
    }

    return name;
  }
}

export class StrictNameRegistry implements NameRegistry {
  /**
   * Allows to provide a good fallback for instances of the
   * same function that are bound to different slot values.
   */
  private readonly _usedNames = new Set<string>();

  private readonly _assignedNames = new WeakMap<TgpuResolvable, string>();

  nameFor(item: TgpuResolvable): string {
    const assignedName = this._assignedNames.get(item);
    if (assignedName !== undefined) {
      return assignedName;
    }

    if (item.label === undefined) {
      throw new Error('Unnamed item found when using a strict NameRegistry');
    }

    let index = 0;
    let unusedName = item.label;
    while (this._usedNames.has(unusedName)) {
      index++;
      unusedName = `${item.label}_${index}`;
    }

    this._usedNames.add(unusedName);
    this._assignedNames.set(item, unusedName);
    return unusedName;
  }
}
