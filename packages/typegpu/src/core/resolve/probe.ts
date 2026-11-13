import { $repr } from '../../shared/symbols.ts';

export class Probe<TPayload> {
  declare readonly [$repr]: TPayload;
}

export interface ProbeSets {
  get<T>(probe: Probe<T>): ReadonlySet<T>;
  entries(): Iterable<[Probe<unknown>, ReadonlySet<unknown>]>;
  readonly isEmpty: boolean;
}

type Transform = (payload: unknown) => unknown;

const noPayloads: ReadonlySet<never> = new Set();

export class ProbeFrame implements ProbeSets {
  readonly #payloads = new Map<Probe<unknown>, Set<unknown>>();
  readonly #transforms = new Map<Probe<unknown>, Transform[]>();

  get<T>(probe: Probe<T>): ReadonlySet<T> {
    return (this.#payloads.get(probe) ?? noPayloads) as ReadonlySet<T>;
  }

  entries(): Iterable<[Probe<unknown>, ReadonlySet<unknown>]> {
    return this.#payloads.entries();
  }

  get isEmpty() {
    return this.#payloads.size === 0;
  }

  report<T>(probe: Probe<T>, payload: T): void {
    const transforms = this.#transforms.get(probe) ?? [];
    const transformed = transforms.reduceRight<unknown>(
      (acc, transform) => transform(acc),
      payload,
    );

    const payloads = this.#payloads.get(probe) ?? new Set();
    this.#payloads.set(probe, payloads.add(transformed));
  }

  withTransform<T, R>(probe: Probe<T>, transform: (payload: T) => T, callback: () => R): R {
    const outer = this.#transforms.get(probe) ?? [];
    this.#transforms.set(probe, [...outer, transform as Transform]);
    try {
      return callback();
    } finally {
      this.#transforms.set(probe, outer);
    }
  }
}
