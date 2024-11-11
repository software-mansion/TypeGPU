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

/** @deprecated */
export const Storage = { usableAsStorage: true } as Storage;

export function isUsableAsStorage<T>(value: T): value is T & Storage {
  return !!(value as unknown as Storage)?.usableAsStorage;
}

// #endregion
