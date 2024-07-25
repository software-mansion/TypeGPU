import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';

// ----------
// Public API
// ----------

type Listener = () => void;
type Unsubscribe = () => void;

export interface WgslPlum<TValue> {
  readonly latest: TValue;

  $name(label: string): this;
  subscribe(listener: () => unknown): Unsubscribe;
}

export interface WgslSettable<TValue> {
  set(value: TValue): void;
}

export function plum<T extends Wgsl>(
  initial: T,
): WgslPlum<T> & WgslSettable<T> & WgslResolvable;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable<T>;

export function plum<T>(initial: T): WgslPlum<T> & WgslSettable<T> {
  return new WgslSourcePlumImpl(initial);
}

// --------------
// Implementation
// --------------

class WgslSourcePlumImpl<TValue>
  implements WgslPlum<TValue>, WgslSettable<TValue>, WgslResolvable
{
  private _label: string | undefined;
  private _value: TValue;
  private readonly _listeners = new Set<Listener>();

  constructor(initial: TValue) {
    this._value = initial;
  }

  $name(label: string): this {
    this._label = label;
    return this;
  }

  get latest(): TValue {
    return this._value;
  }

  get label(): string | undefined {
    return this._label;
  }

  resolve(ctx: ResolutionCtx): string {
    throw new Error('Method not implemented.');
  }

  set(value: TValue) {
    this._value = value;
    for (const listener of this._listeners) {
      listener();
    }
  }

  subscribe(listener: () => unknown): Unsubscribe {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

// class WgslDerivedPlumImpl<TValue> implements WgslPlum<TValue>, WgslResolvable {
//   private _label: string | undefined;
//   private _value: TValue;
//   private readonly _listeners = new Set<Listener>();

//   constructor(initial: TValue) {
//     this._value = initial;
//   }

//   $name(label: string): this {
//     this._label = label;
//     return this;
//   }

//   get latest(): TValue {
//     return this._value;
//   }

//   get label(): string | undefined {
//     return this._label;
//   }

//   resolve(ctx: ResolutionCtx): string {
//     throw new Error('Method not implemented.');
//   }

//   set(value: TValue) {
//     this._value = value;
//     for (const listener of this._listeners) {
//       listener();
//     }
//   }

//   subscribe(listener: () => unknown): Unsubscribe {
//     this._listeners.add(listener);
//     return () => this._listeners.delete(listener);
//   }
// }
