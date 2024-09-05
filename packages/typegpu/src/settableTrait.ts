export const TgpuSettableTrait = Symbol(
  'This item can be set, owns its value (does not get value from an external source)',
);

export interface TgpuSettable {
  readonly [TgpuSettableTrait]: true;
}

export function isSettable(
  value: TgpuSettable | unknown,
): value is TgpuSettable {
  return (value as TgpuSettable)[TgpuSettableTrait] === true;
}
