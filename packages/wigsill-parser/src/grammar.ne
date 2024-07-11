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
  _disambiguate_template: '<',
  lt: '<',
  gt: '>',
  lparen: '(',
  rparen: ')',
  lbrace: '{',
  rbrace: '}',
});

export type TranslationUnit = ReturnType<typeof pp_translation_unit>;
function pp_translation_unit([, declarations]: [any, declarations: [GlobalDecl, any][]]) {
  return declarations.map((tuple) => tuple[0]);
}

export type GlobalDecl = null | FunctionDecl;

export type Statement = string; // TODO: Define this

export type Expression = string; // TODO: Define this

export type CompoundStatement = ReturnType<typeof pp_compound_statement>;
function pp_compound_statement([,, statements]: [any, any, Statement[]]) {
  return { type: 'compound_statement' as const, statements };
}

export type FunctionDecl = ReturnType<typeof pp_function_decl>;
function pp_function_decl([header,, body]: [FunctionHeader, any, CompoundStatement]) {
  return { type: 'function_decl' as const, header, body };
}

export type FunctionHeader = ReturnType<typeof pp_function_header>;
function pp_function_header([,, identifier]: [any, any, Identifier]) {
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

int_literal -> %decimal_int_literal | %hex_int_literal {% id %}
float_literal -> %decimal_float_literal | %hex_float_literal {% id %}

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

# expression -> %number {% id %}
compound_statement -> "{" _ statement:* _ "}" {% pp_compound_statement %}

# TODO: Add all statements
statement ->
    ";" {% () => null %}
  | if_statement {% id %}

# TODO: Add all expressions
expression ->
    %bool_literal {% id %}

# TODO: Add support for attributes
if_statement -> if_clause _ (else_if_clause _):* _ else_clause:? {% pp_if_statement %}

if_clause -> "if" _ expression _ compound_statement {% pp_if_clause %}

else_if_clause -> "else" __ "if" _ expression _ compound_statement {% pp_else_if_clause %}

else_clause -> "else" _ compound_statement {% pp_else_clause %}

# whitespace: `_` is optional, `__` is mandatory.
_  -> wschar:* {% (d) => null %}
__ -> wschar:+ {% (d) => null %}
wschar -> %WS|%NL {% id %}
