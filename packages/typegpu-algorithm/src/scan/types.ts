export interface BinaryOp<TValue = number> {
  operation: (a: TValue, b: TValue) => TValue;
  identityElement: TValue;
}
