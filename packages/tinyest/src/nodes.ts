//
// Statement
//

export const NodeTypeCatalog = {
  snippet: 0,
  return: 1,
  if: 2,
  block: 3,
  let: 4,
  const: 5,
  for: 6,
  while: 7,
  continue: 8,
  break: 9,
  binary_expr: 10,
  assignment_expr: 11,
  logical_expr: 12,
  unary_expr: 13,
  object_expr: 14,
  array_expr: 15,
  member_access: 16,
  index_access: 17,
  call: 18,
  pre_update: 19,
  post_update: 20,
  numeric_literal: 21,
  string_literal: 22,
} as const;

export type NodeTypeCatalog = typeof NodeTypeCatalog;

/**
 * Resolved target code, along with metadata.
 *
 * @example
 * [NodeTypeCatalog.snippet, '13 + 134', { d: ['abstractInt'] }]
 * [NodeTypeCatalog.snippet, '{ return 123; }']
 */
export type Snippet =
  | readonly [type: NodeTypeCatalog['snippet'], code: string]
  | readonly [type: NodeTypeCatalog['snippet'], code: string, meta: unknown];

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
export type Const = readonly [
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

export type BinaryExpression = readonly [
  type: NodeTypeCatalog['binary_expr'],
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
  | '&&=';

export type AssignmentExpression = readonly [
  type: NodeTypeCatalog['assignment_expr'],
  lhs: Expression,
  op: AssignmentOperator,
  rhs: Expression,
];

export type LogicalOperator = '&&' | '||';

export type LogicalExpression = readonly [
  type: NodeTypeCatalog['logical_expr'],
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
  type: NodeTypeCatalog['unary_expr'],
  op: UnaryOperator,
  inner: Expression,
];

export type ObjectExpression = readonly [
  type: NodeTypeCatalog['object_expr'],
  Record<string, Expression>,
];

export type ArrayExpression = readonly [
  type: NodeTypeCatalog['array_expr'],
  values: Expression[],
];

export type MemberAccess = readonly [
  type: NodeTypeCatalog['member_access'],
  object: Expression,
  member: string,
];

export type IndexAccess = readonly [
  type: NodeTypeCatalog['index_access'],
  object: Expression,
  property: Expression,
];

export type Call = readonly [
  type: NodeTypeCatalog['call'],
  identifier: Expression,
  args: Expression[],
];

export type PostUpdate = readonly [
  type: NodeTypeCatalog['pre_update'],
  operator: '++' | '--',
  argument: Expression,
];

export type PreUpdate = readonly [
  type: NodeTypeCatalog['post_update'],
  operator: '++' | '--',
  argument: Expression,
];

/** A numeric literal */
export type Num = readonly [type: NodeTypeCatalog['numeric_literal'], string];

/** A string literal */
export type Str = readonly [type: NodeTypeCatalog['string_literal'], string];

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
  | PreUpdate
  | PostUpdate
  | Call
  | Literal;

export type AnyNode = Statement | Expression;

export type ArgNames =
  | {
      type: 'identifiers';
      names: string[];
    }
  | {
      type: 'destructured-object';
      props: {
        prop: string;
        alias: string;
      }[];
    };
