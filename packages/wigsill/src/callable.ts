// biome-ignore lint/suspicious/noExplicitAny: <generics>
abstract class Callable<TArgs extends [...any[]], TReturn> extends Function {
  _bound: Callable<TArgs, TReturn>;

  constructor() {
    // We create a new Function object using `super`, with a `this` reference
    // to itself (the Function object) provided by binding it to `this`,
    // then returning the bound Function object (which is a wrapper around the
    // the original `this`/Function object). We then also have to store
    // a reference to the bound Function object, as `_bound` on the unbound `this`,
    // so the bound function has access to the new bound object.
    // Pro: Works well, doesn't rely on deprecated features.
    // Con: A little convoluted, and requires wrapping `this` in a bound object.

    super('...args', 'return this._bound._call(...args)');
    // Or without the spread/rest operator:
    // super('return this._bound._call.apply(this._bound, arguments)')
    this._bound = this.bind(this);

    // biome-ignore lint/correctness/noConstructorReturn: <quirks of creating a custom callabke>
    return this._bound;
  }

  abstract _call(...args: TArgs): TReturn;
}

// biome-ignore lint/suspicious/noExplicitAny: <generics>
export type ICallable<TArgs extends [...any[]], TReturn> = (
  ...args: TArgs
) => TReturn;

// biome-ignore lint/suspicious/noExplicitAny: <generics>
export type AsCallable<T, TArgs extends [...any[]], TReturn> = T &
  ICallable<TArgs, TReturn>;

export default Callable;
