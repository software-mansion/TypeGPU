export interface NameRegistry {
  makeUnique(primer?: string): string;
}

export class RandomNameRegistry implements NameRegistry {
  private lastUniqueId = 0;

  makeUnique(primer?: string | undefined): string {
    let label: string;
    if (primer) {
      // sanitizing
      label = primer.replaceAll(/\s/g, '_'); // whitespace -> _
      label = label.replaceAll(/[^\w\d]/g, ''); // removing illegal characters
    } else {
      label = 'item';
    }

    return `${label}_${this.lastUniqueId++}`;
  }
}

export class StrictNameRegistry implements NameRegistry {
  /**
   * Allows to provide a good fallback for instances of the
   * same function that are bound to different slot values.
   */
  private readonly _usedNames = new Set<string>();

  makeUnique(primer?: string | undefined): string {
    if (primer === undefined) {
      throw new Error('Unnamed item found when using a strict name registry');
    }

    let index = 0;
    let unusedName = primer;
    while (this._usedNames.has(unusedName)) {
      index++;
      unusedName = `${primer}_${index}`;
    }

    this._usedNames.add(unusedName);
    return unusedName;
  }
}
