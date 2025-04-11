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

export type For = {
  j: [
    init: Statement | undefined,
    condition: Expression | undefined,
    update: Statement | undefined,
    body: Statement,
  ];
};

export type While = {
  w: [condition: Expression, body: Statement];
};

export type Continue = {
  // kontinue
  k: null;
};

export type Break = {
  // demolish
  d: null;
};

/**
 * A union type of all statements
 */
export type Statement =
  | Return
  | If
  | Block
  | Let
  | Const
  | Expression
  | For
  | While
  | Continue
  | Break;

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

export type ObjectExpression = {
  o: Record<string, Expression>;
};

export type ArrayExpression = {
  y: Expression[];
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

export type Update = {
  // p like please update
  p: [operator: '++' | '--', argument: Expression];
};

/** A numeric literal */
export type Num = {
  n: string;
};

/** A string literal */
export type Str = {
  s: string;
};

export type Literal = Num | Str | boolean;

/** Identifiers are just strings, since string literals are rare in WGSL, and identifiers are everywhere. */
export type Expression =
  | string
  | BinaryExpression
  | AssignmentExpression
  | LogicalExpression
  | UnaryExpression
  | ObjectExpression
  | MemberAccess
  | IndexAccess
  | ArrayExpression
  | Update
  | Call
  | Literal;

export type AnyNode = Statement | Expression;
