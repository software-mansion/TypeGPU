import type { WGSLItem } from './types';

export interface NameRegistry {
  nameFor(item: WGSLItem): string;
}

export class RandomNameRegistry implements NameRegistry {
  private lastUniqueId = 0;
  private names = new WeakMap<WGSLItem, string>();

  nameFor(item: WGSLItem) {
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
  nameFor(item: WGSLItem): string {
    const label = item.debugLabel;

    if (label === undefined) {
      throw new Error('Unaliased item found when using a strict NameRegistry');
    }

    return label;
  }
}
