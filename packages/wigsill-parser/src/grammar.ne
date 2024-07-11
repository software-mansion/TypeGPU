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
%}

@lexer lexer

# entry
translation_unit -> global_decl:*

# global_directive -> "else" # TODO: Implement the global directive non-terminal

global_decl ->
    ";"
  # | global_variable_decl _ ";"
  # | global_value_decl _ ";"
  # | type_alias_decl ";"
  # | struct_decl
    | function_decl
  # | const_assert_statement ";"
    {% id %}

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
function_decl -> function_header _ compound_statement {% ([header,, body]) => ({ type: 'function_decl', header, body }) %}
# TODO: Add param list
# TODO: Add return type
function_header -> "fn" __ ident _ "(" _ ")" {% ([,, identifier]) => ({ type: 'function_header', identifier: identifier.value }) %}

# expression -> %number {% id %}
compound_statement -> "{" _ statement:* _ "}" {% ([,, statements]) => ({ type: 'compound_statement', statements }) %}

# TODO: Add all statements
statement ->
    ";"
  # | if_statement
    {% id %}

# TODO: Add support for attributes
# if_statement -> if_clause _ else_if_clause:* else_clause:?

# if_clause -> "if" _ expression _ compound_statement {% ([, , expr, , stat]) =>  ({ expr, stat }) %}

# else_if_clause -> "else" __ "if" _ expression _ compound_statement

# else_clause -> "else" _ compound_statement

# whitespace: `_` is optional, `__` is mandatory.
_  -> wschar:* {% (d) => null %}
__ -> wschar:+ {% (d) => null %}
wschar -> %WS|%NL {% id %}
