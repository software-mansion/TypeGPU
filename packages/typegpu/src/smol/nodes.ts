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
  be: Expression;
};

export type Var = {
  /** variable's identifier */
  var: string;
  type?: string | undefined;
  init?: Expression | undefined;
};

export type Statement = Return | If | Block | Let | Var | Expression;

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
  x2: [Expression, BinaryOperator, Expression];
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
  x2: [Expression, AssignmentOperator, Expression];
};

export type LogicalOperator = '&&' | '||';

export type LogicalExpression = {
  x2: [Expression, LogicalOperator, Expression];
};

export type MemberAccess = {
  '.': [Expression, string];
};

export type IndexAccess = {
  '[]': [Expression, Expression];
};

export type Call = {
  /** function identifier */
  call: Expression;
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
