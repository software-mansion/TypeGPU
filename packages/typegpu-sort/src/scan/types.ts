export interface BinaryOp {
  operation: (a: number, b: number) => number;
  identityElement: number;
}
