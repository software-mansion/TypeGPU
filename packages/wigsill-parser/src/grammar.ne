@preprocessor typescript

@{%
import moo from 'moo';

const lexer = moo.compile({
  WS:      /[ \\t\\v\\f]+/,
  NL:      { match: /\\n/, lineBreaks: true },
  keyword: ['if', 'else'],
  comment: /\\/\\/.*?$/,
  semi: ";",
  bool_literal: { match: ['true', 'false'], value: (v) => v === 'true' },
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
});

function token_type([token]: [{ type: string }]) {
  return token.type;
}

export type TranslationUnit = ReturnType<typeof pp_translation_unit>;
function pp_translation_unit([ , declarations]: [any, declarations: [GlobalDecl, any][]]) {
  return declarations.map((tuple) => tuple[0]);
}

export type GlobalDecl = null | FunctionDecl;

export type Statement = string; // TODO: Define this

export type Expression = string; // TODO: Define this

export type BoolLiteral = ReturnType<typeof pp_bool_literal>;
function pp_bool_literal([token]: [{ value: boolean }]) {
  return { type: 'bool_literal' as const, value: token.value };
}

export type CompoundStatement = ReturnType<typeof pp_compound_statement>;
function pp_compound_statement([ , , statements]: [any, any, Statement[]]) {
  return { type: 'compound_statement' as const, statements };
}

export type FunctionDecl = ReturnType<typeof pp_function_decl>;
function pp_function_decl([header, , body]: [FunctionHeader, any, CompoundStatement]) {
  return { type: 'function_decl' as const, header, body };
}

export type FunctionHeader = ReturnType<typeof pp_function_header>;
function pp_function_header([ , , identifier]: [any, any, Identifier]) {
  return { type: 'function_header' as const, identifier: identifier.value };
}

export type IfStatement = ReturnType<typeof pp_if_statement>;
function pp_if_statement([if_clause, , else_if_clauses, , else_clause]: [IfClause, any, [ElseIfClause, any][], any, ElseClause | null]) {
  return { type: 'if_statement' as const, if_clause, else_if_clauses: else_if_clauses.map(tuple => tuple[0]), else_clause };
}

type IfClause = ReturnType<typeof pp_if_clause>;
function pp_if_clause([ , , expression, , compound_statement]: [any, any, Expression, any, CompoundStatement]) {
  return { type: 'if_clause' as const, expression, compound_statement };
}

type ElseIfClause = ReturnType<typeof pp_else_if_clause>;
function pp_else_if_clause([ , , , , expression, , compound_statement]: [any, any, any, any, Expression, any, CompoundStatement]) {
  return { type: 'else_if_clause' as const, expression, compound_statement };
}

type ElseClause = ReturnType<typeof pp_else_clause>;
function pp_else_clause([ , , compound_statement]: [any, any, CompoundStatement]) {
  return { type: 'else_clause' as const, compound_statement };
}

%}

@lexer lexer

# entry

# translation_unit -> global_directive:* global_decl:*
translation_unit -> _ (global_decl _):* {% pp_translation_unit %}

global_directive -> "else" # TODO: Implement the global directive non-terminal

global_decl ->
    ";" {% () => null %}
  # | global_variable_decl _ ";"
  # | global_value_decl _ ";"
  # | type_alias_decl _ ";"
  # | struct_decl
    | function_decl {% id %}
  # | const_assert_statement ";"

ident -> %ident_pattern {% id %}
# member_ident -> %ident_pattern {% id %}

global_variable_decl -> "if" # TODO
global_value_decl -> null # TODO
type_alias_decl -> null # TODO
struct_decl -> null # TODO
const_assert_statement -> null # TODO

# TODO: Add support for attributes
function_decl -> function_header _ compound_statement {% pp_function_decl %}
# TODO: Add param list
# TODO: Add return type
function_header -> "fn" __ ident _ "(" _ ")" {% pp_function_header %}

compound_statement -> "{" _ statement:* _ "}" {% pp_compound_statement %}

# TODO: Add all statements
statement ->
    ";" {% () => null %}
  | if_statement {% id %}

swizzle_name -> %swizzle_name

#
# Literals
#

literal ->
    int_literal {% id %}
  | float_literal {% id %}
  | bool_literal {% id %}
int_literal -> %decimal_int_literal {% id %} | %hex_int_literal {% id %}
float_literal -> %decimal_float_literal {% id %} | %hex_float_literal {% id %}
bool_literal -> %bool_literal {% pp_bool_literal %}

#
# Expressions
#

primary_expression ->
  # template_elaborated_ident
# | call_expression
  literal
  | paren_expression

# call_expression -> template_elaborated_ident _ argument_expression_list

paren_expression -> "(" _ expression _ ")"

component_or_swizzle_specifier ->
 "[" _ expression _ "]" _ component_or_swizzle_specifier:?
| "." ident _ component_or_swizzle_specifier:? # TODO: Use member_ident instead of ident if necessary
| "." swizzle_name _ component_or_swizzle_specifier:?

unary_expression ->
    singular_expression
  | "-" _ unary_expression
  | "!" _ unary_expression
  | "~" _ unary_expression
  | "*" _ unary_expression
  | "&" _ unary_expression

singular_expression ->
  primary_expression _ component_or_swizzle_specifier:?

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

multiplicative_expression -> unary_expression {% id %} | multiplicative_expression _ multiplicative_operator _ unary_expression
additive_expression -> multiplicative_expression {% id %} | additive_expression _ additive_operator _ multiplicative_expression
shift_expression -> additive_expression {% id %} | unary_expression _ shift_operator _ unary_expression
relational_expression -> shift_expression {% id %} | shift_expression _ relational_operator _ shift_expression
short_circuit_and_expression -> relational_expression {% id %} | short_circuit_and_expression _ "&&" _ relational_expression
short_circuit_or_expression -> relational_expression {% id %} | short_circuit_or_expression _ "||" _ relational_expression
binary_or_expression -> unary_expression {% id %} | binary_or_expression _ "|" _ unary_expression
binary_and_expression -> unary_expression {% id %} | binary_and_expression _ "&" _ unary_expression
binary_xor_expression -> unary_expression {% id %} | binary_xor_expression _ "^" _ unary_expression
bitwise_expression ->
    binary_and_expression _ "&" _ unary_expression
  | binary_or_expression _ "|" _ unary_expression
  | binary_xor_expression _ "^" _ unary_expression

# TODO: Add all expressions
expression ->
    relational_expression {% id %}
  | short_circuit_or_expression "||" relational_expression
  | short_circuit_and_expression "&&" relational_expression
  | bitwise_expression {% id %}

# TODO: Add support for attributes
if_statement -> if_clause _ (else_if_clause _):* _ else_clause:? {% pp_if_statement %}

if_clause -> "if" _ expression _ compound_statement {% pp_if_clause %}

else_if_clause -> "else" __ "if" _ expression _ compound_statement {% pp_else_if_clause %}

else_clause -> "else" _ compound_statement {% pp_else_clause %}

# whitespace: `_` is optional, `__` is mandatory.
_  -> wschar:* {% (d) => null %}
__ -> wschar:+ {% (d) => null %}
wschar -> %WS|%NL {% id %}
