//
// Statement
//

/**
 * Represents a return statement
 */
export type Return = {
  r: Expression | null;
};

/**
 * Represents an if statement
 */
export type If = {
  q:
    | [condition: Expression, consequent: Statement]
    | [condition: Expression, consequent: Statement, alternate: Statement];
};

/**
 * Represents a block of statements
 */
export type Block = {
  b: Statement[];
};

/**
 * Represents a let statement
 */
export type Let = {
  l: [identifier: string] | [identifier: string, value: Expression];
};

/**
 * Represents a const statement
 */
export type Const = {
  c: [identifier: string, value: Expression];
};

/**
 * A union type of all statements
 */
export type Statement = Return | If | Block | Let | Const | Expression;

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
  x: [lhs: Expression, op: BinaryOperator, rhs: Expression];
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
  x: [lhs: Expression, op: AssignmentOperator, rhs: Expression];
};

export type LogicalOperator = '&&' | '||';

export type LogicalExpression = {
  x: [lhs: Expression, op: LogicalOperator, rhs: Expression];
};

export type UnaryOperator =
  | '-'
  | '+'
  | '!'
  | '~'
  | 'typeof'
  | 'void'
  | 'delete';

export type UnaryExpression = {
  u: [op: UnaryOperator, inner: Expression];
};

export type MemberAccess = {
  a: [object: Expression, member: string];
};

export type IndexAccess = {
  i: [object: Expression, property: Expression];
};

export type Call = {
  f: [identifier: Expression, args: Expression[]];
};

/** A numeric literal */
export type Num = {
  n: string;
};

export type Literal = Num | boolean;

/** Identifiers are just strings, since string literals are rare in WGSL, and identifiers are everywhere. */
export type Expression =
  | string
  | BinaryExpression
  | AssignmentExpression
  | LogicalExpression
  | UnaryExpression
  | MemberAccess
  | IndexAccess
  | Call
  | Literal;

export type AnyNode = Statement | Expression;
