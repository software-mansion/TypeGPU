@preprocessor typescript

@{%
import moo from 'moo';

const lexer = moo.compile({
  WS:      /[ \t\v\f]+/,
  NL:      { match: /\n/, lineBreaks: true },
  comment: /\/\/.*?$/,
  decimal_float_literal: /0[fh]|[1-9][0-9]*[fh]|[0-9]*\.[0-9]+(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+\.[0-9]*(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+[eE][+-]?[0-9]+[fh]?/,
  hex_float_literal: /0[xX][0-9a-fA-F]*\.[0-9a-fA-F]+(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+[pP][+-]?[0-9]+[fh]?/,
  decimal_int_literal: { match: /(?:0|[1-9][0-9]*)[iu]?/ },
  hex_int_literal: { match: /0[xX][0-9a-fA-F]+[iu]?/ },

  // WGSL spec apparently accepts plenty of Unicode, but lets limit it to just ASCII for now.
  ident_pattern: {
    match: /[a-z_][a-z_0-9]*/,
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
  shift_left_assign: '<<=',
  shift_right_assign: '>>=',
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
  plus_eq: '+=',
  minus_eq: '-=',
  star_eq: '*=',
  slash_eq: '/=',
  percent_eq: '%=',
  amp_eq: '&=',
  pipe_eq: '|=',
  caret_eq: '^=',
  plus_plus: '++',
  minus_minus: '--',
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
  semi: ';',
  colon: ':',
  comma: ',',
  at: '@',
  assign: '=',
  underscore: '_',
});

// Ignoring whitespace and comments
lexer.next = (next => () => {
  let tok;
  while ((tok = next.call(lexer)) && (tok.type === "comment" || tok.type === "WS" || tok.type === "NL")) {}
  return tok;
})(lexer.next);

%}

@lexer lexer

# entry

@{%
export type Main =
    TranslationUnit
  | Statement
  | Expression;

%}
main ->
    translation_unit {% id %}
  | statement        {% id %}
  | expression       {% id %}

@{% export type TranslationUnit = { type: 'translation_unit', declarations: GlobalDecl[] }; %}
# translation_unit -> global_directive:* global_decl:*
translation_unit -> global_decl:* {% ([declarations]) => ({ type: 'translation_unit', declarations }) %}

# global_directive -> null # TODO: Implement the global directive non-terminal

@{%
export type GlobalDecl =
    null
  | VariableDecl
  | ValueDecl
  | OverrideDecl
  | FunctionDecl;

%}
global_decl ->
    ";" {% () => null %}
  | variable_decl ";" {% id %}
  | value_decl ";" {% id %}
  | override_decl ";" {% id %}
  # | type_alias_decl ";"
  # | struct_decl
    | function_decl {% id %}
  # | const_assert_statement ";"

@{% export type Ident = { type: 'ident', value: string }; %}
ident -> %ident_pattern {% ([token]) => ({ type: 'ident', value: token.value }) %}

# type_alias_decl -> null # TODO
# struct_decl -> null # TODO
# const_assert_statement -> null # TODO

#
# 6.8. Type Specifier Grammar
# https://www.w3.org/TR/WGSL/#type-specifiers
#

@{% export type TypeSpecifier = TemplateElaboratedIdent; %}
type_specifier -> template_elaborated_ident {% id %}

@{% export type TemplateElaboratedIdent = { type: 'template_elaborated_ident', ident: string, template_list: TemplateList | null }; %}

template_elaborated_ident ->
  ident template_list:? {% ([ident, template_list]) => ({ type: 'template_elaborated_ident', ident: ident.value, template_list }) %}

@{% export type TemplateList = Expression[]; %}

template_list ->
  "<" template_arg_comma_list ">" {% ([ , template_list]) => template_list %}

template_arg_comma_list ->
  expression ("," expression):* ",":? {% ([first, rest]) => [first, ...rest.map(tuple => tuple[1])] %}

@{%
export type FunctionDecl = { type: 'function_decl', header: FunctionHeader, body: CompoundStatement, attrs: Attribute[] };
export type FunctionHeader = { type: 'function_header', identifier: string };

%}
function_decl -> attribute:* function_header compound_statement {% ([attrs, header, body]) => ({ type: 'function_decl', header, body, attrs }) %}
# TODO: Add param list
# TODO: Add return type
function_header ->
  "fn" ident "(" ")" {% ([ , identifier]) => ({ type: 'function_header', identifier: identifier.value }) %}

#
# Statements
#

@{% export type ReturnStatement = { type: 'return_statement', expression: Expression | null }; %}
return_statement -> "return" expression:? {% ([ , expression]) => ({ type: 'return_statement', expression }) %}

@{% export type CompoundStatement = Statement[]; %}
compound_statement -> "{" statement:* "}" {% ([ , statements]) => statements.filter((val) => val !== null) %}

@{%
export type Statement =
    null
  | ReturnStatement
  | IfStatement
  | ForStatement
  | CallStatement
  | CompoundStatement;

%}

#
# 9.7. Statements Grammar Summary
# https://www.w3.org/TR/WGSL/#statements-summary
#

statement ->
    ";" {% () => null %}
  | return_statement ";" {% id %}
  | if_statement {% id %}
# | switch_statement {% id %}
# | loop_statement {% id %}
  | for_statement {% id %}
# | while_statement {% id %}
  | call_statement ";" {% id %}
# | func_call_statement ";" {% id %}
  | variable_or_value_statement ";" {% id %}
# | break_statement ";" {% id %}
# | continue_statement ";" {% id %}
# | "discard" ";" {% id %}
  | variable_updating_statement ";" {% id %}
  | compound_statement {% id %}
# | const_assert_statement ";" {% id %}

@{% export type VariableUpdatingStatement = AssignmentStatement; %}
variable_updating_statement ->
    assignment_statement {% id %}
  | increment_statement {% id %}
  | decrement_statement {% id %}

@{% export type CallStatement = { type: 'call_statement', ident: TemplateElaboratedIdent, args: Expression[] }; %}
call_statement -> call_phrase {% ([phrase]) => ({ type: 'call_statement', ident: phrase.ident, args: phrase.args }) %}

@{% export type Swizzle = { type: 'swizzle', value: string }; %}
swizzle -> %swizzle_name {% ([value]) => ({ type: 'swizzle', value }) %}

@{%
export type IfStatement =  { type: 'if_statement', if_clause: IfClause, else_if_clauses: ElseIfClause[], else_clause: ElseClause | null };
export type IfClause =     { type: 'if_clause', expression: Expression, body: CompoundStatement };
export type ElseIfClause = { type: 'else_if_clause', expression: Expression, body: CompoundStatement };
export type ElseClause =   { type: 'else_clause', body: CompoundStatement };

%}

# TODO: Add support for attributes
if_statement -> if_clause else_if_clause:* else_clause:? {% ([if_clause, else_if_clauses, else_clause]) => ({ type: 'if_statement' as const, if_clause, else_if_clauses, else_clause }) %}

if_clause -> "if" expression compound_statement {% ([ , expression, body]) => ({ type: 'if_clause', expression, body }) %}

else_if_clause -> "else" "if" expression compound_statement {% ([ , , expression, body]) => ({ type: 'else_if_clause', expression, body }) %}

else_clause -> "else" compound_statement {% ([, body]) => ({ type: 'else_clause', body }) %}

@{%
export type ForStatement = {
  type: 'for_statement',
  attrs: Attribute[],
  init: VariableOrValueStatement | VariableUpdatingStatement | CallStatement | null,
  check: Expression | null,
  update: VariableUpdatingStatement | CallStatement | null,
  body: CompoundStatement,
};

%}


for_statement ->
  attribute:* "for" "(" for_header ")" compound_statement {% ([attrs, , , header, , body]) => ({ type: 'for_statement', attrs, ...header, body }) %}

for_header ->
  for_init:? ";" expression:? ";" for_update:? {% ([init, , check, , update]) => ({ init, check, update }) %}

for_init ->
    variable_or_value_statement {% id %}
  | variable_updating_statement {% id %}
  | func_call_statement {% id %}

for_update ->
    variable_updating_statement {% id %}
  | func_call_statement {% id %}

#
# 7.4. Variable and Value Declaration Grammar Summary
# https://www.w3.org/TR/WGSL/#var-and-value-decl-grammar
#

@{% export type VariableOrValueStatement = VariableDecl | LetDecl | ValueDecl; %}
variable_or_value_statement ->
    variable_decl {% id %}
  | let_decl {% id %}
  | value_decl {% id %}

@{% export type LetDecl = { type: 'let_decl', ident: string, typespec: TypeSpecifier, expr: Expression }; %}
let_decl ->
  "let" optionally_typed_ident "=" expression {% ([ , typed_ident, , expr]) => ({ type: 'let_decl', ...typed_ident, expr }) %}

@{% export type VariableDecl = { type: 'variable_decl', template_list: TemplateList | null, ident: string, typespec: TypeSpecifier | null, expr: Expression | null }; %}
variable_decl ->
  "var" template_list:? optionally_typed_ident ("=" expression):? {% ([ , template_list, typed_ident, opt_expr]) => ({ type: 'variable_decl', template_list: template_list, ...typed_ident, expr: opt_expr ? opt_expr[1] : null }) %}

optionally_typed_ident ->
  ident (":" type_specifier):? {% ([ident, typespec]) => ({ ident: ident.value, typespec: typespec ? typespec[1] : null }) %}

@{% export type ValueDecl = { type: 'value_decl', ident: string, typespec: TypeSpecifier | null, expr: Expression }; %}
value_decl ->
  "const" optionally_typed_ident "=" expression {% ([ , typed_ident, , expr]) => ({ type: 'value_decl', ...typed_ident, expr }) %}

@{% export type OverrideDecl = { type: 'override_decl', attrs: Attribute[], ident: string, typespec: TypeSpecifier | null, expr: Expression | null }; %}
override_decl ->
  attribute:* "override" optionally_typed_ident ("=" expression):? {% ([attrs, , typed_ident, opt_expr]) => ({ type: 'override_decl', attrs, ...typed_ident, expr: opt_expr ? opt_expr[1] : null }) %}

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
# 8. Expressions
# https://www.w3.org/TR/WGSL/#expressions
#

#
# 8.18. Expression Grammar Summary
# https://www.w3.org/TR/WGSL/#expression-grammar
#

@{%
export type PrimaryExpression =
    TemplateElaboratedIdent
  | CallExpression
  | Literal
  | ParenExpression

%}

primary_expression ->
  template_elaborated_ident {% id %}
  | call_expression {% id %}
  | literal {% id %}
  | paren_expression {% id %}

@{% export type CallExpression = { type: 'call_expression', ident: TemplateElaboratedIdent, args: ArgumentExpressionList }; %}
call_expression -> call_phrase {% ([phrase]) => ({ type: 'call_expression', ident: phrase.ident, args: phrase.args }) %}

@{% export type ParenExpression = { type: 'paren_expression', expression: Expression }; %}
paren_expression -> "(" expression ")" {% ([ , expression]) => ({ type: 'paren_expression', expression }) %}

@{% export type ArgumentExpressionList = Expression[]; %}
argument_expression_list ->
  "(" expression_comma_list:? ")" {% ([ , list]) => list ?? [] %}

expression_comma_list ->
  expression ("," expression):* ",":? {% ([first, rest]) => [first, ...rest.map(tuple => tuple[1])] %}

@{%
export type Accessor =
    { type: 'index_accessor', index: Expression, next: Accessor | null }
  | { type: 'member_accessor', member: string, next: Accessor | null }
  | { type: 'swizzle_accessor', swizzle: Swizzle, next: Accessor | null };

%}

component_or_swizzle_specifier ->
    "[" expression "]" component_or_swizzle_specifier:? {% ([ , index, , next]) => ({ type: 'index_accessor', index, next }) %}
    # TODO: Use member_ident instead of ident if necessary
  | "." ident component_or_swizzle_specifier:? {% ([ , ident, next]) => ({ type: 'member_accessor', member: ident.value, next }) %}
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

@{% export type LhsExpression =
    { type: 'access_expr', expression: CoreLhsExpression, accessor: Accessor | null }
  | { type: 'deref', expression: LhsExpression }
  | { type: 'ref', expression: LhsExpression };

%}

lhs_expression ->
    core_lhs_expression component_or_swizzle_specifier:? {% ([expression, accessor]) => ({ type: 'access_expr', expression, accessor }) %}
  | "*" lhs_expression {% ([ , expression]) => ({ type: 'deref', expression }) %}
  | "&" lhs_expression {% ([ , expression]) => ({ type: 'ref', expression }) %}

@{% type CoreLhsExpression = Ident | { type: 'paren_expression', expression: LhsExpression }; %}
core_lhs_expression ->
    ident {% id %}
  | "(" lhs_expression ")" {% ([ , expression]) => ({ type: 'paren_expression', expression }) %}

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

@{% type Attribute = { type: 'attribute', ident: string, args: ArgumentExpressionList }; %}
attribute ->
  "@" ident argument_expression_list:? {% ([ , ident, args]) => ({ type: 'attribute', ident: ident.value, args: args ?? [] }) %}

#
# 9.2. Assignment Statement
# https://www.w3.org/TR/WGSL/#assignment
#

@{% export type AssignmentStatement = { type: 'assignment_statement', lhs: LhsExpression | '_', op: string, rhs: Expression }; %}
assignment_statement ->
  lhs_expression "=" expression                            {% ([lhs, , rhs]) => ({ type: 'assignment_statement', lhs, op: '=', rhs }) %}
  | lhs_expression compound_assignment_operator expression {% ([lhs, op, rhs]) => ({ type: 'assignment_statement', lhs, op: op.value, rhs }) %}
  | "_" "=" expression                                     {% ([ , , rhs]) => ({ type: 'assignment_statement', lhs: '_', op: '=', rhs }) %}

#
# 9.2.3. Compound Assignment
# https://www.w3.org/TR/WGSL/#compound-assignment-sec
#

compound_assignment_operator ->
    "+=" {% id %}
  | "-=" {% id %}
  | "*=" {% id %}
  | "/=" {% id %}
  | "%=" {% id %}
  | "&=" {% id %}
  | "|=" {% id %}
  | "^=" {% id %}
  | ">>=" {% id %}
  | "<<=" {% id %}

#
# 9.3. Increment and Decrement Statements
# https://www.w3.org/TR/WGSL/#increment-decrement
#

@{% export type IncrementStatement = { type: 'increment_statement', expression: LhsExpression }; %}
increment_statement ->
  lhs_expression "++" {% ([expression]) => ({ type: 'increment_statement', expression }) %}

@{% export type DecrementStatement = { type: 'decrement_statement', expression: LhsExpression }; %}
decrement_statement ->
  lhs_expression "--" {% ([expression]) => ({ type: 'decrement_statement', expression }) %}