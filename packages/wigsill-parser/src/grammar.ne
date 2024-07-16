@preprocessor typescript

@{%
import moo from 'moo';

const lexer = moo.compile({
  WS:      /[ \\t\\v\\f]+/,
  NL:      { match: /\\n/, lineBreaks: true },
  comment: /\\/\\/.*?$/,
  semi: ";",
  decimal_float_literal: /0[fh]|[1-9][0-9]*[fh]|[0-9]*\\.[0-9]+(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+\\.[0-9]*(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+[eE][+-]?[0-9]+[fh]?/,
  hex_float_literal: /0[xX][0-9a-fA-F]*\\.[0-9a-fA-F]+(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+\\.[0-9a-fA-F]*(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+[pP][+-]?[0-9]+[fh]?/,
  decimal_int_literal: { match: /(?:0|[1-9][0-9]*)[iu]?/ },
  hex_int_literal: { match: /0[xX][0-9a-fA-F]+[iu]?/ },

  // WGSL spec apparently accepts plenty of Unicode, but lets limit it to just ASCII for now.
  ident_pattern: {
    match: /[a-z_][a-z_0-9]+/,
    type: moo.keywords({
      if: 'if',
      else: 'else',
      return: 'return',
      break: 'break',
      'true': 'true',
      'false': 'false'
    })
  },
  swizzle_name: { match: /[rgba]|[rgba][rgba]|[rgba][rgba][rgba]|[rgba][rgba][rgba][rgba]|[xyzw]|[xyzw][xyzw]|[xyzw][xyzw][xyzw]|[xyzw][xyzw][xyzw][xyzw]/ },
  shift_left: '<<',
  shift_right: '>>',
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
  period: '.',
});

// Ignoring whitespace and comments
lexer.next = (next => () => {
  let tok;
  while ((tok = next.call(lexer)) && (tok.type === "comment" || tok.type === "WS" || tok.type === "NL")) {}
  return tok;
})(lexer.next);

export type Statement = string; // TODO: Define this

%}

@lexer lexer

# entry

@{%
export type Main = TranslationUnit | Statement | Expression;

%}
main ->
    translation_unit {% id %}
  | statement        {% id %}
  | expression       {% id %}

@{%
export type TranslationUnit = { type: 'translation_unit', declarations: GlobalDecl[] };
%}
# translation_unit -> global_directive:* global_decl:*
translation_unit -> global_decl:* {% ([declarations]) => ({ type: 'translation_unit', declarations }) %}

# global_directive -> null # TODO: Implement the global directive non-terminal

@{%
export type GlobalDecl = null | FunctionDecl;
%}
global_decl ->
    ";" {% () => null %}
  # | global_variable_decl ";"
  # | global_value_decl ";"
  # | type_alias_decl ";"
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

type_specifier -> template_elaborated_ident

@{%
export type TemplateElaboratedIdent = { type: 'template_elaborated_ident', value: string, template_list: TemplateList | null };

%}

template_elaborated_ident ->
  ident template_list:? {% ([ident, template_list]) => ({ type: 'template_elaborated_ident', value: ident.value, template_list }) %}

@{%
export type TemplateList = Expression[];

%}

template_list ->
  "<" template_arg_comma_list ">" {% ([ , template_list]) => template_list %}

template_arg_comma_list ->
  expression ("," expression):* ",":? {% ([first, rest]) => [first, ...rest.map(tuple => tuple[1])] %}

@{%
export type FunctionDecl = { type: 'function_decl', header: FunctionHeader, body: CompoundStatement };

export type FunctionHeader = ReturnType<typeof pp_function_header>;
function pp_function_header([ , identifier]: [any, Ident]) {
  return { type: 'function_header' as const, identifier: identifier.value };
}

%}
# TODO: Add support for attributes
function_decl -> function_header compound_statement {% ([header, body]) => ({ type: 'function_decl', header, body }) %}
# TODO: Add param list
# TODO: Add return type
function_header -> "fn" ident "(" ")" {% pp_function_header %}

#
# Statements
#

@{%
export type ReturnStatement = { type: 'return_statement', expression: Expression };

%}

return_statement -> "return" expression:? {% ([ , expression]) => ({ type: 'return_statement', expression }) %}

@{%
export type CompoundStatement = Statement[];

%}

compound_statement -> "{" statement:* "}" {% ([ , statements]) => statements.filter((val) => val !== null) %}

# TODO: Add all statements
statement ->
    ";" {% () => null %}
  | return_statement ";" {% ([val]) => val %}
  | func_call_statement ";" {% ([val]) => val %}
  | if_statement {% id %}
@{%
export type Swizzle = { type: 'swizzle', value: string };

%}

@{%
export type FuncCallStatement = { type: 'call_statement', ident: TemplateElaboratedIdent, args: Expression[] };

%}
func_call_statement -> call_phrase {% ([phrase]) => ({ type: 'call_statement', ident: phrase.ident, args: phrase.args }) %}

swizzle -> %swizzle_name {% ([value]) => ({ type: 'swizzle', value }) %}

@{%

export type IfStatement = { type: 'if_statement', if_clause: IfClause, else_if_clauses: ElseIfClause[], else_clause: ElseClause | null };
export type IfClause = { type: 'if_clause', expression: Expression, body: CompoundStatement };
export type ElseIfClause = { type: 'else_if_clause', expression: Expression, body: CompoundStatement };
export type ElseClause = { type: 'else_clause', body: CompoundStatement };

function pp_else_clause([ , , body]: [any, any, CompoundStatement]) {
  return { type: 'else_clause' as const, body };
}

%}

# TODO: Add support for attributes
if_statement -> if_clause else_if_clause:* else_clause:? {% ([if_clause, else_if_clauses, else_clause]) => ({ type: 'if_statement' as const, if_clause, else_if_clauses, else_clause }) %}

if_clause -> "if" expression compound_statement {% ([ , expression, body]) => ({ type: 'if_clause', expression, body }) %}

else_if_clause -> "else" "if" expression compound_statement {% ([ , , expression, body]) => ({ type: 'else_if_clause', expression, body }) %}

else_clause -> "else" compound_statement {% ([, body]) => ({ type: 'else_clause', body }) %}

#
# Literals
#

@{%
export type Literal = BoolLiteral | IntLiteral | FloatLiteral;
export type IntLiteral = { type: 'int_literal', value: string };
export type FloatLiteral = { type: 'float_literal', value: string };
export type BoolLiteral = { type: 'bool_literal', value: 'true' | 'false' };

%}
literal ->
    int_literal {% id %}
  | float_literal {% id %}
  | bool_literal {% id %}

int_literal ->
    %decimal_int_literal {% ([token]) => ({ type: 'int_literal', value: token.value }) %}
  | %hex_int_literal     {% ([token]) => ({ type: 'int_literal', value: token.value }) %}

float_literal ->
    %decimal_float_literal {% ([token]) => ({ type: 'float_literal', value: token.value }) %}
  | %hex_float_literal     {% ([token]) => ({ type: 'float_literal', value: token.value }) %}

bool_literal ->
    "true"  {% () => ({ type: 'bool_literal', value: 'true' }) %}
  | "false" {% () => ({ type: 'bool_literal', value: 'false' }) %}

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

@{%
export type CallExpression = { type: 'function_call', ident: TemplateElaboratedIdent, args: ArgumentExpressionList };

%}

call_expression -> call_phrase {% ([phrase]) => ({ type: 'call_expression', ident: phrase.ident, args: phrase.args }) %}

@{%
export type ParenExpression = { type: 'paren_expression', expression: Expression };

%}

paren_expression -> "(" expression ")" {% ([ , expression]) => ({ type: 'paren_expression', expression }) %}

@{%
export type ArgumentExpressionList = Expression[];

%}
argument_expression_list ->
  "(" expression_comma_list:? ")" {% ([ , list]) => list ?? [] %}

expression_comma_list ->
  expression ("," expression):* ",":? {% ([first, rest]) => [first, ...rest.map(tuple => tuple[1])] %}

@{%
export type Accessor =
    { type: 'index_accessor', index: Expression, next: Accessor | null }
  | { type: 'member_accessor', member: Ident, next: Accessor | null }
  | { type: 'swizzle_accessor', swizzle: Swizzle, next: Accessor | null };

%}

component_or_swizzle_specifier ->
    "[" expression "]" component_or_swizzle_specifier:? {% ([ , index, , next]) => ({ type: 'index_accessor', index, next }) %}
    # TODO: Use member_ident instead of ident if necessary
  | "." ident component_or_swizzle_specifier:? {% ([ , ident, next]) => ({ type: 'member_accessor', member, next }) %}
  | "." swizzle component_or_swizzle_specifier:?  {% ([ , swizzle, next]) => ({ type: 'swizzle_accessor', swizzle, next }) %}

@{%
export type SingularExpression =
    PrimaryExpression
  | { type: 'accessor', expression: PrimaryExpression, accessor: Accessor };

%}

singular_expression ->
    primary_expression {% id %}
  | primary_expression component_or_swizzle_specifier  {% ([expression, accessor]) => ({ type: 'accessor', expression, accessor }) %}

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
  | "-" unary_expression {% ([ , expression]) => ({ type: 'negate', expression }) %}
  | "!" unary_expression {% ([ , expression]) => ({ type: 'logic_not', expression }) %}
  | "~" unary_expression {% ([ , expression]) => ({ type: 'binary_not', expression }) %}
  | "*" unary_expression {% ([ , expression]) => ({ type: 'deref', expression }) %}
  | "&" unary_expression {% ([ , expression]) => ({ type: 'ref', expression }) %}

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
  | multiplicative_expression multiplicative_operator unary_expression {% ([lhs, type, rhs]) => ({ type, lhs, rhs }) %}
additive_expression ->
    multiplicative_expression {% id %}
  | additive_expression additive_operator multiplicative_expression {% ([lhs, type, rhs]) => ({ type, lhs, rhs }) %}
shift_expression ->
    additive_expression {% id %}
  | unary_expression shift_operator unary_expression {% ([lhs, type, rhs]) => ({ type, lhs, rhs }) %}
relational_expression ->
    shift_expression {% id %}
  | shift_expression relational_operator shift_expression {% ([lhs, type, rhs]) => ({ type, lhs, rhs }) %}
short_circuit_and_expression ->
    relational_expression {% id %}
  | short_circuit_and_expression "&&" relational_expression {% ([lhs, , rhs]) => ({ type: 'logic_and', lhs, rhs }) %}
short_circuit_or_expression ->
    relational_expression {% id %}
  | short_circuit_or_expression "||" relational_expression {% ([lhs, , rhs]) => ({ type: 'logic_or', lhs, rhs }) %}
binary_and_expression ->
    unary_expression {% id %}
  | binary_and_expression "&" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_and', lhs, rhs }) %}
binary_or_expression ->
    unary_expression {% id %}
  | binary_or_expression "|" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_or', lhs, rhs }) %}
binary_xor_expression ->
    unary_expression {% id %}
  | binary_xor_expression "^" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_xor', lhs, rhs }) %}
bitwise_expression ->
    binary_and_expression "&" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_and', lhs, rhs }) %}
  | binary_or_expression "|" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_or', lhs, rhs }) %}
  | binary_xor_expression "^" unary_expression {% ([lhs, , rhs]) => ({ type: 'binary_xor', lhs, rhs }) %}

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
  | short_circuit_and_expression "&&" relational_expression {% ([lhs, , rhs]) => ({ type: 'logic_and', lhs, rhs }) %}
  | short_circuit_or_expression "||" relational_expression {% ([lhs, , rhs]) => ({ type: 'logic_or', lhs, rhs }) %}
  | bitwise_expression {% id %}

#
# Partials
#

call_phrase ->
  template_elaborated_ident argument_expression_list {% ([ident, args]) => ({ ident, args }) %}
