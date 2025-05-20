import { getName } from './name.ts';

export interface NotAllowed<TMsg> {
  reason: TMsg;
}

export type ExtensionGuard<TFlag, TMsg, TAllowed> = boolean extends TFlag
  ? NotAllowed<TMsg> | TAllowed
  : TAllowed;

// #region Shared usage extensions

export interface StorageFlag {
  usableAsStorage: true;
}

/**
 * @deprecated Use StorageFlag instead.
 */
export type Storage = StorageFlag;

export function isUsableAsStorage<T>(value: T): value is T & StorageFlag {
  return !!(value as unknown as StorageFlag)?.usableAsStorage;
}

/**
 * @category Errors
 */
export class NotStorageError extends Error {
  constructor(value: object) {
    super(
      `Resource '${
        getName(value) ?? '<unnamed>'
      }' cannot be bound as 'storage'. Use .$usage('storage') to allow it.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotStorageError.prototype);
  }
}

// #endregion
