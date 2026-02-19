//
// Statement
//

export const NodeTypeCatalog = {
  // frequent
  block: 0,
  binaryExpr: 1,
  assignmentExpr: 2,
  logicalExpr: 3,
  unaryExpr: 4,
  numericLiteral: 5,
  call: 6,
  memberAccess: 7,
  indexAccess: 8,

  // regular
  return: 10,
  if: 11,
  let: 12,
  const: 13,
  for: 14,
  while: 15,
  continue: 16,
  break: 17,
  forOf: 18,

  // rare
  arrayExpr: 100,
  preUpdate: 101,
  postUpdate: 102,
  stringLiteral: 103,
  objectExpr: 104,
  conditionalExpr: 105,
} as const;

export type NodeTypeCatalog = typeof NodeTypeCatalog;

/**
 * Represents a return statement
 */
export type Return =
  | readonly [type: NodeTypeCatalog['return'], expr: Expression]
  | readonly [type: NodeTypeCatalog['return']];

/**
 * Represents an if statement
 */
export type If =
  | readonly [type: NodeTypeCatalog['if'], cond: Expression, then: Statement]
  | readonly [
    type: NodeTypeCatalog['if'],
    cond: Expression,
    then: Statement,
    alt: Statement,
  ];

/**
 * Represents a block of statements
 */
export type Block = readonly [type: NodeTypeCatalog['block'], Statement[]];

/**
 * Represents a let statement
 */
export type Let =
  | readonly [type: NodeTypeCatalog['let'], identifier: string]
  | readonly [
    type: NodeTypeCatalog['let'],
    identifier: string,
    value: Expression,
  ];

/**
 * Represents a const statement
 */
export type Const =
  | readonly [type: NodeTypeCatalog['const'], identifier: string]
  | readonly [
    type: NodeTypeCatalog['const'],
    identifier: string,
    value: Expression,
  ];

export type For = readonly [
  type: NodeTypeCatalog['for'],
  init: Statement | null,
  condition: Expression | null,
  update: Statement | null,
  body: Statement,
];

export type While = readonly [
  type: NodeTypeCatalog['while'],
  condition: Expression,
  body: Statement,
];

export type Continue = readonly [type: NodeTypeCatalog['continue']];

export type Break = readonly [type: NodeTypeCatalog['break']];

export type ForOf = readonly [
  type: NodeTypeCatalog['forOf'],
  left: Const | Let,
  right: Expression,
  body: Statement,
];

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
  | Break
  | ForOf;

//
// Expression
//

export type BinaryOperator =
  | '=='
  | '!='
  | '==='
  | '!=='
  | '<'
  | '<='
  | '>'
  | '>='
  | '<<'
  | '>>'
  | '>>>'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '|'
  | '^'
  | '&'
  | 'in'
  | 'instanceof'
  | '**';

export type BinaryExpression = readonly [
  type: NodeTypeCatalog['binaryExpr'],
  lhs: Expression,
  op: BinaryOperator,
  rhs: Expression,
];

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
  | '&&='
  | '>>>='
  | '??=';

export type AssignmentExpression = readonly [
  type: NodeTypeCatalog['assignmentExpr'],
  lhs: Expression,
  op: AssignmentOperator,
  rhs: Expression,
];

export type LogicalOperator = '&&' | '||' | '??';

export type LogicalExpression = readonly [
  type: NodeTypeCatalog['logicalExpr'],
  lhs: Expression,
  op: LogicalOperator,
  rhs: Expression,
];

export type UnaryOperator =
  | '-'
  | '+'
  | '!'
  | '~'
  | 'typeof'
  | 'void'
  | 'delete';

export type UnaryExpression = readonly [
  type: NodeTypeCatalog['unaryExpr'],
  op: UnaryOperator,
  inner: Expression,
];

export type ObjectExpression = readonly [
  type: NodeTypeCatalog['objectExpr'],
  Record<string, Expression>,
];

export type ArrayExpression = readonly [
  type: NodeTypeCatalog['arrayExpr'],
  values: Expression[],
];

export type ConditionalExpression = readonly [
  type: NodeTypeCatalog['conditionalExpr'],
  test: Expression,
  consequent: Expression,
  alternative: Expression,
];

export type MemberAccess = readonly [
  type: NodeTypeCatalog['memberAccess'],
  object: Expression,
  member: string,
];

export type IndexAccess = readonly [
  type: NodeTypeCatalog['indexAccess'],
  object: Expression,
  property: Expression,
];

export type Call = readonly [
  type: NodeTypeCatalog['call'],
  identifier: Expression,
  args: Expression[],
];

export type PostUpdate = readonly [
  type: NodeTypeCatalog['postUpdate'],
  operator: '++' | '--',
  argument: Expression,
];

export type PreUpdate = readonly [
  type: NodeTypeCatalog['preUpdate'],
  operator: '++' | '--',
  argument: Expression,
];

/** A numeric literal */
export type Num = readonly [type: NodeTypeCatalog['numericLiteral'], string];

/** A string literal */
export type Str = readonly [type: NodeTypeCatalog['stringLiteral'], string];

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
  | ConditionalExpression
  | PreUpdate
  | PostUpdate
  | Call
  | Literal;

export type AnyNode = Statement | Expression;

export const FuncParameterType = {
  identifier: 'i',
  destructuredObject: 'd',
} as const;

export type FuncParameter =
  | {
    type: typeof FuncParameterType.identifier;
    name: string;
  }
  | {
    type: typeof FuncParameterType.destructuredObject;
    props: {
      name: string;
      alias: string;
    }[];
  };
