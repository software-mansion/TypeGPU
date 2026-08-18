import { UnknownData } from '../../data/dataTypes.ts';
import { snip } from '../../data/snippet.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';

export class ResolvableString {
  [$internal] = true;
  #value;

  constructor(value: string) {
    this.#value = value;
  }

  [$resolve]() {
    return snip(this.#value, UnknownData, 'runtime', true);
  }
}
