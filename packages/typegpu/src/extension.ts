export interface NotAllowed<TMsg> {
  reason: TMsg;
}

export type ExtensionGuard<TFlag, TMsg, TAllowed> = boolean extends TFlag
  ? NotAllowed<TMsg>
  : TAllowed;

// #region Shared usage extensions

export interface Storage {
  usableAsStorage: true;
}

export const Storage = { usableAsStorage: true } as Storage;

export function isUsableAsStorage<T>(value: T): value is T & Storage {
  return !!(value as unknown as Storage)?.usableAsStorage;
}

/**
 * @category Errors
 */
export class NotStorageError extends Error {
  constructor(value: { readonly label: string | undefined }) {
    super(
      `Resource '${value.label ?? '<unnamed>'}' cannot be bound as 'storage'. Use .$usage('storage') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotStorageError.prototype);
  }
}

// #endregion
