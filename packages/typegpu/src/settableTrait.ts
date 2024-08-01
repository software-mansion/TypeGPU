export const WgslSettableTrait = Symbol(
  'This item can be set, owns its value (does not get value from an external source)',
);

export interface WgslSettable {
  readonly [WgslSettableTrait]: true;
}

export function isSettable(
  value: WgslSettable | unknown,
): value is WgslSettable {
  return (value as WgslSettable)[WgslSettableTrait] === true;
}
