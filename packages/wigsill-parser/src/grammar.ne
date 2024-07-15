@preprocessor typescript

@{%
import moo from 'moo';

const lexer = moo.compile({
  WS:      /[ \\t\\v\\f]+/,
  NL:      { match: /\\n/, lineBreaks: true },
  keyword: ['if', 'else'],
  comment: /\\/\\/.*?$/,
  semi: ";",
  bool_literal: ['true', 'false'],
  decimal_int_literal: { match: /(?:0|[1-9][0-9]*)[iu]?/ },
  hex_int_literal: { match: /0[xX][0-9a-fA-F]+[iu]?/ },
  decimal_float_literal: /0[fh]|[1-9][0-9]*[fh]|[0-9]*\.[0-9]+(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+\.[0-9]*(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+[eE][+-]?[0-9]+[fh]?/,
  hex_float_literal: /0[xX][0-9a-fA-F]*\.[0-9a-fA-F]+(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+[pP][+-]?[0-9]+[fh]?/,

  // WGSL spec apparently accepts plenty of Unicode, but lets limit it to just ASCII for now.
  ident_pattern: /\\w+/,
  swizzle_name: { match: /[rgba]|[rgba][rgba]|[rgba][rgba][rgba]|[rgba][rgba][rgba][rgba]|[xyzw]|[xyzw][xyzw]|[xyzw][xyzw][xyzw]|[xyzw][xyzw][xyzw][xyzw]/ },
  shift_left: '<<',
  shift_right: '>>',
  _disambiguate_template: '<',
  lt: '<',
  gt: '>',
  le: '<=',
  ge: '>=',
  lparen: '(',
  rparen: ')',
  lbrace: '{',
  rbrace: '}',
  lbracket: '[',
  rbracket: ']',
  plus: '+',
  minus: '-',
  and: '&&',
  or: '||',
  amp: '&',
  pipe: '|',
  caret: '^',
  star: '*',
  slash: '/',
  percent: '%',
  bang: '!',
  tilde: '~',
});

export type Statement = string; // TODO: Define this

%}

@lexer lexer

# entry

@{%
export type TranslationUnit = { declarations: GlobalDecl[] };
%}
# translation_unit -> global_directive:* global_decl:*
translation_unit -> _ (global_decl _):* {% ([ , declarationTuples]) => ({ declarations: declarationTuples.map((tuple) => tuple[0]) }) %}

global_directive -> "else" # TODO: Implement the global directive non-terminal

@{%
export type GlobalDecl = null | FunctionDecl;
%}
global_decl ->
    ";" {% () => null %}
  # | global_variable_decl _ ";"
  # | global_value_decl _ ";"
  # | type_alias_decl _ ";"
  # | struct_decl
    | function_decl {% id %}
  # | const_assert_statement ";"

@{%
export type Ident = { type: 'ident', value: string };
%}
ident -> %ident_pattern {% ([token]) => ({ type: 'ident', value: token.value }) %}
# member_ident -> %ident_pattern {% id %}

global_variable_decl -> "if" # TODO
global_value_decl -> null # TODO
type_alias_decl -> null # TODO
struct_decl -> null # TODO
const_assert_statement -> null # TODO

@{%
export type FunctionDecl = { type: 'function_decl', header: FunctionHeader, body: CompoundStatement };

export type FunctionHeader = ReturnType<typeof pp_function_header>;
function pp_function_header([ , , identifier]: [any, any, Identifier]) {
  return { type: 'function_header' as const, identifier: identifier.value };
}
%}
# TODO: Add support for attributes
function_decl -> function_header _ compound_statement {% ([header, , body]) => ({ type: 'function_decl', header, body }) %}
# TODO: Add param list
# TODO: Add return type
function_header -> "fn" __ ident _ "(" _ ")" {% pp_function_header %}

@{%
export type CompoundStatement = Statement[];

%}

compound_statement -> "{" _ statement:* _ "}" {% ([ , , statements]) => statements %}

# TODO: Add all statements
statement ->
    ";" {% () => null %}
  | if_statement {% id %}
@{%
type Swizzle = { type: 'swizzle', value: string };
%}

swizzle -> %swizzle_name {% ([value]) => ({ type: 'swizzle', value }) %}

#
# Literals
#

@{%
export type Literal = BoolLiteral | IntLiteral | FloatLiteral;

export type IntLiteral = { type: 'int_literal', value: string };
export type FloatLiteral = { type: 'float_literal', value: string };
export type BoolLiteral = { type: 'bool_literal', value: 'true' | 'false' };

function pp_literal([token]: [{ type: string, value: string }]): Literal {
  return { type: token.type, value: token.value };
}
%}
literal ->
    int_literal {% id %}
  | float_literal {% id %}
  | bool_literal {% id %}

int_literal -> %decimal_int_literal {% pp_literal %} | %hex_int_literal {% pp_literal %}
float_literal -> %decimal_float_literal {% pp_literal %} | %hex_float_literal {% pp_literal %}
bool_literal -> %bool_literal {% pp_literal %}

#
# Expressions
#

@{%
export type PrimaryExpression =
// template_elaborated_ident
// | call_expression
    Literal
  | ParenExpression

%}

primary_expression ->
  # template_elaborated_ident
  # | call_expression
  literal {% id %}
  | paren_expression {% id %}

# call_expression -> template_elaborated_ident _ argument_expression_list

@{%
export type ParenExpression = { type: 'paren_expression', expression: Expression };

%}

paren_expression -> "(" _ expression _ ")" {% ([ , , expression]) => ({ type: 'paren_expression', expression }) %}

@{%
export type Accessor =
    { type: 'index_accessor', index: Expression, next: Accessor | null }
  | { type: 'member_accessor', member: Ident, next: Accessor | null }
  | { type: 'swizzle_accessor', swizzle: Swizzle, next: Accessor | null };

%}

component_or_swizzle_specifier ->
    "[" _ expression _ "]" _ component_or_swizzle_specifier:? {% ([ , , index, , , , next]) => ({ type: 'index_accessor', index, next }) %}
    # TODO: Use member_ident instead of ident if necessary
  | "." ident _ component_or_swizzle_specifier:? {% ([ , ident, , next]) => ({ type: 'member_accessor', member, next }) %}
  | "." swizzle _ component_or_swizzle_specifier:?  {% ([ , swizzle, , next]) => ({ type: 'swizzle_accessor', swizzle, next }) %}

@{%
export type SingularExpression =
    PrimaryExpression
  | { type: 'accessor', expression: PrimaryExpression, accessor: Accessor };

%}

singular_expression ->
    primary_expression {% id %}
  | primary_expression _ component_or_swizzle_specifier  {% ([expression, , accessor]) => ({ type: 'accessor', expression, accessor }) %}

@{%
export type UnaryExpression =
    SingularExpression
  | { type: 'negate', expression: UnaryExpression }
  | { type: 'logic_not', expression: UnaryExpression }
  | { type: 'binary_not', expression: UnaryExpression }
  | { type: 'deref', expression: UnaryExpression }
  | { type: 'ref', expression: UnaryExpression }

%}

unary_expression ->
    singular_expression {% id %}
  | "-" _ unary_expression {% ([ , , expression]) => ({ type: 'negate', expression }) %}
  | "!" _ unary_expression {% ([ , , expression]) => ({ type: 'logic_not', expression }) %}
  | "~" _ unary_expression {% ([ , , expression]) => ({ type: 'binary_not', expression }) %}
  | "*" _ unary_expression {% ([ , , expression]) => ({ type: 'deref', expression }) %}
  | "&" _ unary_expression {% ([ , , expression]) => ({ type: 'ref', expression }) %}

multiplicative_operator ->
    "*" {% () => 'multiply' %}
  | "/" {% () => 'divide' %}
  | "%" {% () => 'mod' %}

additive_operator ->
    "+" {% () => 'add' %}
  | "-" {% () => 'subtract' %}

shift_operator ->
    "<<" {% () => 'shift_left' %}
  | ">>" {% () => 'shift_right' %}
relational_operator ->
    "<" {% () => 'less_than' %}
  | ">" {% () => 'greater_than' %}
  | "<=" {% () => 'less_than_equal' %}
  | ">=" {% () => 'greater_than_equal' %}
  | "==" {% () => 'equal' %}
  | "!=" {% () => 'not_equal' %}


@{%
type MultiplicativeExpression = UnaryExpression | { type: 'multiply' | 'divide', lhs: MultiplicativeExpression, rhs: UnaryExpression };
type AdditiveExpression = MultiplicativeExpression | { type: 'add' | 'subtract', lhs: AdditiveExpression, rhs: MultiplicativeExpression };
type ShiftExpression = AdditiveExpression | { type: 'shift_left' | 'shift_right', lhs: UnaryExpression, rhs: UnaryExpression };
type RelationalExpression =
    ShiftExpression
  | {
      type: 'less_than'
          | 'greater_than' 
          | 'less_than_equal' 
          | 'greater_than_equal' 
          | 'equal' 
          | 'not_equal',
      lhs: ShiftExpression,
      rhs: ShiftExpression
    }
type ShortCircuitAndExpression = RelationalExpression | { type: 'logic_and', lhs: ShortCircuitAndExpression, rhs: RelationalExpression };
type ShortCircuitOrExpression = RelationalExpression | { type: 'logic_or', lhs: ShortCircuitOrExpression, rhs: RelationalExpression };
type BinaryAndExpression = UnaryExpression | { type: 'binary_and', lhs: BinaryAndExpression, rhs: UnaryExpression };
type BinaryOrExpression = UnaryExpression | { type: 'binary_or', lhs: BinaryOrExpression, rhs: UnaryExpression };
type BinaryXorExpression = UnaryExpression | { type: 'binary_xor', lhs: BinaryXorExpression, rhs: UnaryExpression };
type BitwiseExpression = 
    Exclude<BinaryAndExpression, UnaryExpression>
  | Exclude<BinaryOrExpression, UnaryExpression>
  | Exclude<BinaryXorExpression, UnaryExpression>

%}

multiplicative_expression ->
    unary_expression {% id %}
  | multiplicative_expression _ multiplicative_operator _ unary_expression {% ([lhs, , type, , rhs]) => ({ type, lhs, rhs }) %}
additive_expression ->
    multiplicative_expression {% id %}
  | additive_expression _ additive_operator _ multiplicative_expression {% ([lhs, , type, , rhs]) => ({ type, lhs, rhs }) %}
shift_expression -> additive_expression {% id %} | unary_expression _ shift_operator _ unary_expression {% ([lhs, , type, , rhs]) => ({ type, lhs, rhs }) %}
relational_expression -> shift_expression {% id %} | shift_expression _ relational_operator _ shift_expression {% ([lhs, , type, , rhs]) => ({ type, lhs, rhs }) %}
short_circuit_and_expression -> relational_expression {% id %} | short_circuit_and_expression _ "&&" _ relational_expression {% ([lhs, , , , rhs]) => ({ type: 'logic_and', lhs, rhs }) %}
short_circuit_or_expression -> relational_expression {% id %} | short_circuit_or_expression _ "||" _ relational_expression {% ([lhs, , , , rhs]) => ({ type: 'logic_or', lhs, rhs }) %}
binary_and_expression -> unary_expression {% id %} | binary_and_expression _ "&" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_and', lhs, rhs }) %}
binary_or_expression -> unary_expression {% id %} | binary_or_expression _ "|" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_or', lhs, rhs }) %}
binary_xor_expression -> unary_expression {% id %} | binary_xor_expression _ "^" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_xor', lhs, rhs }) %}
bitwise_expression ->
    binary_and_expression _ "&" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_and', lhs, rhs }) %}
  | binary_or_expression _ "|" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_or', lhs, rhs }) %}
  | binary_xor_expression _ "^" _ unary_expression {% ([lhs, , , , rhs]) => ({ type: 'binary_xor', lhs, rhs }) %}

@{%
export type Expression =
    RelationalExpression
  | ShortCircuitAndExpression
  | ShortCircuitOrExpression
  | BitwiseExpression;

%}
# TODO: Add all expressions
expression ->
    relational_expression {% id %}
  | short_circuit_and_expression _ "&&" _ relational_expression {% ([lhs, , , , rhs]) => ({ type: 'logic_and', lhs, rhs }) %}
  | short_circuit_or_expression _ "||" _ relational_expression {% ([lhs, , , , rhs]) => ({ type: 'logic_or', lhs, rhs }) %}
  | bitwise_expression {% id %}

@{%

export type IfStatement = ReturnType<typeof pp_if_statement>;
function pp_if_statement([if_clause, , else_if_clauses, , else_clause]: [IfClause, any, [ElseIfClause, any][], any, ElseClause | null]) {
  return { type: 'if_statement' as const, if_clause, else_if_clauses: else_if_clauses.map(tuple => tuple[0]), else_clause };
}

type IfClause = ReturnType<typeof pp_if_clause>;
function pp_if_clause([ , , expression, , body]: [any, any, Expression, any, CompoundStatement]) {
  return { type: 'if_clause' as const, expression, body };
}

type ElseIfClause = ReturnType<typeof pp_else_if_clause>;
function pp_else_if_clause([ , , , , expression, , body]: [any, any, any, any, Expression, any, CompoundStatement]) {
  return { type: 'else_if_clause' as const, expression, body };
}

type ElseClause = ReturnType<typeof pp_else_clause>;
function pp_else_clause([ , , body]: [any, any, CompoundStatement]) {
  return { type: 'else_clause' as const, body };
}

%}

# TODO: Add support for attributes
if_statement -> if_clause _ (else_if_clause _):* _ else_clause:? {% pp_if_statement %}

if_clause -> "if" _ expression _ compound_statement {% pp_if_clause %}

else_if_clause -> "else" __ "if" _ expression _ compound_statement {% pp_else_if_clause %}

else_clause -> "else" _ compound_statement {% pp_else_clause %}

# whitespace: `_` is optional, `__` is mandatory.
_  -> wschar:* {% (d) => null %}
__ -> wschar:+ {% (d) => null %}
wschar -> %WS|%NL {% id %}
