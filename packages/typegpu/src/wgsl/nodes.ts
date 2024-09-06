type TemplateElaboratedIdent = 'temp';
type Literal = 'temp';

//
// 3.7. Identifiers
// https://www.w3.org/TR/WGSL/#identifiers
//

type Ident = {
  type: 'ident';
  raw: string;
};

//
// 8.18. Expression Grammar Summary
// https://www.w3.org/TR/WGSL/#expression-grammar
//

type PrimaryExpression =
  | TemplateElaboratedIdent
  | CallExpression
  | Literal
  | ParenExpression;

type CallExpression = CallPhrase;

type CallPhrase = {
  type: 'call_phrase';
  ident: TemplateElaboratedIdent;
  args: Expression[];
};

type ParenExpression = {
  type: 'paren_expression';
  expr: Expression;
};

// argument_expression_list - grouping non-terminal, omitted
// expression_comma_list - grouping non-terminal, omitted

/** @example [expr] */
type ComputedAccess = {
  type: 'computed_access';
  expr: Expression;
};

/** @example .ident */
type MemberAccess = {
  type: 'member_access';
  ident: Ident;
};

type ComponentOrSwizzleSpecifier = {
  type: 'component_or_swizzle_specifier';
  access: ComputedAccess | MemberAccess;
  next?: ComponentOrSwizzleSpecifier | undefined;
};

/** @example -expr */
type NegateExpression = {
  type: 'negate_expression';
  expr: UnaryExpression;
};

/** @example !expr */
type NotExpression = {
  type: 'not_expression';
  expr: UnaryExpression;
};

/** @example ~expr */
type BinaryNotExpression = {
  type: 'binary_not_expression';
  expr: UnaryExpression;
};

/** @example *expr */
type DerefExpression = {
  type: 'deref_expression';
  expr: UnaryExpression;
};

/** @example &expr */
type RefExpression = {
  type: 'ref_expression';
  expr: UnaryExpression;
};

type UnaryExpression =
  | SingularExpression
  | NegateExpression
  | NotExpression
  | BinaryNotExpression
  | DerefExpression
  | RefExpression;

type SingularExpression = {
  type: 'singular_expression';
  expr: PrimaryExpression;
  access?: ComponentOrSwizzleSpecifier | undefined;
};

type LhsExpression = LhsCoreExpression | LhsDerefExpression | LhsRefExpression;

type LhsCoreExpression = {
  type: 'lhs_core_expression';
  expr: LhsParenExpression | Ident;
  access?: ComponentOrSwizzleSpecifier | undefined;
};

/** @example *expr */
type LhsDerefExpression = {
  type: 'lhs_deref_expression';
  expr: LhsExpression;
};

/** @example &expr */
type LhsRefExpression = {
  type: 'lhs_ref_expression';
  expr: LhsExpression;
};

type LhsParenExpression = {
  type: 'lhs_paren_expression';
};

/**
 * Part of `multiplicative_expression` spec definition.
 * @example lhs * rhs
 */
type Multiply = {
  type: 'multiply';
  lhs: MultiplicativeExpression;
  rhs: UnaryExpression;
};

/**
 * Part of `multiplicative_expression` spec definition.
 * @example lhs / rhs
 */
type Divide = {
  type: 'divide';
  lhs: MultiplicativeExpression;
  rhs: UnaryExpression;
};

/**
 * Part of `multiplicative_expression` spec definition.
 * @example lhs % rhs
 */
type Modulo = {
  type: 'modulo';
  lhs: MultiplicativeExpression;
  rhs: UnaryExpression;
};

type MultiplicativeExpression = UnaryExpression | Multiply | Divide | Modulo;

/**
 * Part of `additive_expression` spec definition.
 * @example lhs + rhs
 */
type Add = {
  type: 'add';
  lhs: AdditiveExpression;
  rhs: MultiplicativeExpression;
};

/**
 * Part of `additive_expression` spec definition.
 * @example lhs - rhs
 */
type Subtract = {
  type: 'subtract';
  lhs: AdditiveExpression;
  rhs: MultiplicativeExpression;
};

type AdditiveExpression = MultiplicativeExpression | Add | Subtract;

// TODO: ShiftExpression
// TODO: RelationalExpression
// TODO: ShortCircuitAndExpression
// TODO: ShortCircuitOrExpression
// TODO: BinaryOrExpression
// TODO: BinaryAndExpression
// TODO: BinaryXorExpression
// TODO: BitwiseExpression
type Expression = 'temp'; // TODO: Expression

//
// 9.2. Assignment Statement
// https://www.w3.org/TR/WGSL/#assignment
//
