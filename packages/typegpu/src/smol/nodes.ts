//
// Statement
//

export type Return = {
  return: Expression | null;
};

export type If = {
  /** condition */
  if: Expression;
  do: Statement;
  else?: Statement | undefined;
};

export type Block = {
  block: Statement[];
};

export type Let = {
  /** local constant's identifier */
  let: string;
  be?: Expression | undefined;
};

export type Statement = Return | If | Block | Let | Expression;

//
// Expression
//

export type BinaryOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '<<'
  | '>>'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '|'
  | '^'
  | '&';

export type BinaryExpression = {
  [K in BinaryOperator]: [Expression, Expression];
};

export type AssignmentOperator =
  | '='
  | '+='
  | '-='
  | '*='
  | '/='
  | '%='
  | '<<='
  | '>>='
  | '|='
  | '^='
  | '&='
  | '**='
  | '||='
  | '&&=';

export type AssignmentExpression = {
  [K in AssignmentOperator]: [Expression, Expression];
};

export type LogicalOperator = '&&' | '||';

export type LogicalExpression = {
  [K in LogicalOperator]: [Expression, Expression];
};

export type MemberAccess = {
  '.': [Expression, string];
};

export type IndexAccess = {
  '[]': [Expression, Expression];
};

export type Call = {
  /** function identifier */
  call: string;
  /** expressions passed as function arguments */
  args: Expression[];
};

/** A numeric literal */
export type Num = {
  num: string;
};

export type Literal = Num | boolean;

/** Identifiers are just strings, since string literals are rare in WGSL, and identifiers are everywhere. */
export type Expression =
  | string
  | BinaryExpression
  | AssignmentExpression
  | LogicalExpression
  | MemberAccess
  | IndexAccess
  | Call
  | Literal;

export type AnyNode = Statement | Expression;
