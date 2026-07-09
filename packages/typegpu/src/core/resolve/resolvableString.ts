import { snip, UnknownData } from '../../internal.ts';
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
