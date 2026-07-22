import type { Minifier } from './types.ts';

export class MinifierNullImpl implements Minifier {
  minify(name: string): string {
    return name;
  }
  getIfMinified(name: string) {
    return name;
    // TODO: reconsider, this may backfire
  }
}

export class MinifierImpl implements Minifier {
  #namesUsed = 0;
  #nameMap: Map<string, string> = new Map();

  #generateFreshName() {
    this.#namesUsed += 1;
    return 'a'.repeat(this.#namesUsed); // TODO: implement this properly, take into account forbidden words like 'in'
  }

  minify(name: string): string {
    let minifiedName = this.#nameMap.get(name);
    if (!minifiedName) {
      minifiedName = this.#generateFreshName();
      this.#nameMap.set(name, minifiedName);
    }

    return minifiedName;
  }

  getIfMinified(name: string) {
    return this.#nameMap.get(name);
  }
}
