import type { WgslResolvable } from './types';

export interface NameRegistry {
  nameFor(item: WgslResolvable): string;
}

export class RandomNameRegistry implements NameRegistry {
  private lastUniqueId = 0;
  private names = new WeakMap<WgslResolvable, string>();

  nameFor(item: WgslResolvable) {
    let name = this.names.get(item);

    if (name === undefined) {
      // creating sanitized name
      let label: string;
      if (item.debugLabel) {
        label = item.debugLabel.replaceAll(/\s/g, '_'); // whitespace -> _
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
  nameFor(item: WgslResolvable): string {
    const label = item.debugLabel;

    if (label === undefined) {
      throw new Error('Unaliased item found when using a strict NameRegistry');
    }

    return label;
  }
}
