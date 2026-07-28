/**
 * The base shape of a soul: a plain record of all definitional state of a resource,
 * holding everything that survives a device boundary. Souls carry own data properties
 * only, no methods, no prototype and no symbol keys
 */
export interface TgpuSoul<TType extends string = string> {
  readonly type: TType;
  label?: string | undefined;
}

/** A soul of a resource that owns a device object, filled in by `[$internal].materialize()` */
export interface TgpuDeviceOwningSoul<
  TType extends string = string,
  TRaw = unknown,
> extends TgpuSoul<TType> {
  readonly device: GPUDevice;
  raw?: TRaw | undefined;
}
