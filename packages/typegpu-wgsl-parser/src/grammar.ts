/* eslint-disable */
// @ts-nocheck
// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var ident_pattern: any;
declare var swizzle_name: any;
declare var decimal_int_literal: any;
declare var hex_int_literal: any;
declare var decimal_float_literal: any;
declare var hex_float_literal: any;

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
    match: /[a-z_A-Z][a-z_0-9A-Z]*/,
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
  arrow: '->',
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



export type Main =
    TranslationUnit
  | Statement
  | Expression;


 export type TranslationUnit = { type: 'translation_unit', declarations: GlobalDecl[] }; 

export type GlobalDecl =
    null
  | GlobalVariableDecl
  | ValueDecl
  | OverrideDecl
  | FunctionDecl
  | StructDecl


 export type Ident = { type: 'ident', value: string }; 
 export type StructDecl = { type: 'struct_decl', ident: string, members: StructMember[] }; 
 export type StructMember = { type: 'struct_member', attrs: Attribute[], ident: string, typespec: TypeSpecifier }; 
 export type TypeSpecifier = TemplateElaboratedIdent; 
 export type TemplateElaboratedIdent = { type: 'template_elaborated_ident', ident: string, template_list: TemplateList | null }; 
 export type TemplateList = Expression[]; 

export type FunctionArgument = { type: 'func_argument', ident: string, typespec: TypeSpecifier };
export type FunctionDecl = { type: 'function_decl', header: FunctionHeader, body: CompoundStatement, attrs: Attribute[] };
export type FunctionHeader = { type: 'function_header', ident: string, returntype: ReturnType | null, args: FunctionArgument[] | null };
export type ReturnType = { type: 'return_type', typespec: TypeSpecifier };


 export type ReturnStatement = { type: 'return_statement', expression: Expression | null }; 
 export type CompoundStatement = Statement[]; 

export type Statement =
    null
  | ReturnStatement
  | IfStatement
  | ForStatement
  | CallStatement
  | CompoundStatement;


 export type VariableUpdatingStatement = AssignmentStatement; 
 export type CallStatement = { type: 'call_statement', ident: TemplateElaboratedIdent, args: Expression[] }; 
 export type Swizzle = { type: 'swizzle', value: string }; 

export type IfStatement =  { type: 'if_statement', if_clause: IfClause, else_if_clauses: ElseIfClause[], else_clause: ElseClause | null };
export type IfClause =     { type: 'if_clause', expression: Expression, body: CompoundStatement };
export type ElseIfClause = { type: 'else_if_clause', expression: Expression, body: CompoundStatement };
export type ElseClause =   { type: 'else_clause', body: CompoundStatement };



export type ForStatement = {
  type: 'for_statement',
  attrs: Attribute[],
  init: VariableOrValueStatement | VariableUpdatingStatement | CallStatement | null,
  check: Expression | null,
  update: VariableUpdatingStatement | CallStatement | null,
  body: CompoundStatement,
};


 export type VariableOrValueStatement = VariableDecl | LetDecl | ValueDecl; 
 export type LetDecl = { type: 'let_decl', ident: string, typespec: TypeSpecifier, expr: Expression }; 
 export type VariableDecl = { type: 'variable_decl', template_list: TemplateList | null, ident: string, typespec: TypeSpecifier | null, expr: Expression | null }; 
 export type GlobalVariableDecl = {type: 'global_variable_decl', attributes: Attribute[] | null, variable_decl: VariableDecl}; 
 export type ValueDecl = { type: 'value_decl', ident: string, typespec: TypeSpecifier | null, expr: Expression }; 
 export type OverrideDecl = { type: 'override_decl', attrs: Attribute[], ident: string, typespec: TypeSpecifier | null, expr: Expression | null }; 

export type Literal = BoolLiteral | IntLiteral | FloatLiteral;
export type IntLiteral = { type: 'int_literal', value: string };
export type FloatLiteral = { type: 'float_literal', value: string };
export type BoolLiteral = { type: 'bool_literal', value: 'true' | 'false' };



export type PrimaryExpression =
    TemplateElaboratedIdent
  | CallExpression
  | Literal
  | ParenExpression


 export type CallExpression = { type: 'call_expression', ident: TemplateElaboratedIdent, args: ArgumentExpressionList }; 
 export type ParenExpression = { type: 'paren_expression', expression: Expression }; 
 export type ArgumentExpressionList = Expression[]; 

export type Accessor =
    { type: 'index_accessor', index: Expression, next: Accessor | null }
  | { type: 'member_accessor', member: string, next: Accessor | null }
  | { type: 'swizzle_accessor', swizzle: Swizzle, next: Accessor | null };



export type SingularExpression =
    PrimaryExpression
  | { type: 'accessor', expression: PrimaryExpression, accessor: Accessor };



export type UnaryExpression =
    SingularExpression
  | { type: 'negate', expression: UnaryExpression }
  | { type: 'logic_not', expression: UnaryExpression }
  | { type: 'binary_not', expression: UnaryExpression }
  | { type: 'deref', expression: UnaryExpression }
  | { type: 'ref', expression: UnaryExpression }


 export type LhsExpression =
    { type: 'access_expr', expression: CoreLhsExpression, accessor: Accessor | null }
  | { type: 'deref', expression: LhsExpression }
  | { type: 'ref', expression: LhsExpression };


 type CoreLhsExpression = Ident | { type: 'paren_expression', expression: LhsExpression }; 

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



export type Expression =
    RelationalExpression
  | ShortCircuitAndExpression
  | ShortCircuitOrExpression
  | BitwiseExpression;


 type Attribute = { type: 'attribute', ident: string, args: ArgumentExpressionList }; 
 export type AssignmentStatement = { type: 'assignment_statement', lhs: LhsExpression | '_', op: string, rhs: Expression }; 
 export type IncrementStatement = { type: 'increment_statement', expression: LhsExpression }; 
 export type DecrementStatement = { type: 'decrement_statement', expression: LhsExpression }; 
interface NearleyToken {
  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: never) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: NearleyLexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
};

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    {"name": "main", "symbols": ["translation_unit"], "postprocess": id},
    {"name": "main", "symbols": ["statement"], "postprocess": id},
    {"name": "main", "symbols": ["expression"], "postprocess": id},
    {"name": "translation_unit$ebnf$1", "symbols": []},
    {"name": "translation_unit$ebnf$1", "symbols": ["translation_unit$ebnf$1", "global_decl"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "translation_unit", "symbols": ["translation_unit$ebnf$1"], "postprocess": ([declarations]) => ({ type: 'translation_unit', declarations })},
    {"name": "global_decl", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "global_decl", "symbols": ["global_variable_decl", {"literal":";"}], "postprocess": id},
    {"name": "global_decl", "symbols": ["value_decl", {"literal":";"}], "postprocess": id},
    {"name": "global_decl", "symbols": ["override_decl", {"literal":";"}], "postprocess": id},
    {"name": "global_decl", "symbols": ["struct_decl"], "postprocess": id},
    {"name": "global_decl", "symbols": ["function_decl"], "postprocess": id},
    {"name": "ident", "symbols": [(lexer.has("ident_pattern") ? {type: "ident_pattern"} : ident_pattern)], "postprocess": ([token]) => ({ type: 'ident', value: token.value })},
    {"name": "struct_decl", "symbols": [{"literal":"struct"}, "ident", "struct_body_decl"], "postprocess": ([ , ident, members]) => ({ type: 'struct_decl', ident: ident.value, members })},
    {"name": "struct_body_decl$ebnf$1", "symbols": []},
    {"name": "struct_body_decl$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "struct_member"]},
    {"name": "struct_body_decl$ebnf$1", "symbols": ["struct_body_decl$ebnf$1", "struct_body_decl$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "struct_body_decl$ebnf$2", "symbols": [{"literal":","}], "postprocess": id},
    {"name": "struct_body_decl$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "struct_body_decl$ebnf$3", "symbols": [{"literal":";"}], "postprocess": id},
    {"name": "struct_body_decl$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "struct_body_decl", "symbols": [{"literal":"{"}, "struct_member", "struct_body_decl$ebnf$1", "struct_body_decl$ebnf$2", {"literal":"}"}, "struct_body_decl$ebnf$3"], "postprocess": ([ , first, rest]) => [first, ...rest.map(tuple => tuple[1])]},
    {"name": "struct_member$ebnf$1", "symbols": []},
    {"name": "struct_member$ebnf$1", "symbols": ["struct_member$ebnf$1", "attribute"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "struct_member", "symbols": ["struct_member$ebnf$1", "ident", {"literal":":"}, "type_specifier"], "postprocess": ([attrs, ident,, typespec]) => ({ type: 'struct_member', attrs, ident: ident.value, typespec })},
    {"name": "type_specifier", "symbols": ["template_elaborated_ident"], "postprocess": id},
    {"name": "template_elaborated_ident$ebnf$1", "symbols": ["template_list"], "postprocess": id},
    {"name": "template_elaborated_ident$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "template_elaborated_ident", "symbols": ["ident", "template_elaborated_ident$ebnf$1"], "postprocess": ([ident, template_list]) => ({ type: 'template_elaborated_ident', ident: ident.value, template_list })},
    {"name": "template_list", "symbols": [{"literal":"<"}, "template_arg_comma_list", {"literal":">"}], "postprocess": ([ , template_list]) => template_list},
    {"name": "template_arg_comma_list$ebnf$1", "symbols": []},
    {"name": "template_arg_comma_list$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "expression"]},
    {"name": "template_arg_comma_list$ebnf$1", "symbols": ["template_arg_comma_list$ebnf$1", "template_arg_comma_list$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "template_arg_comma_list$ebnf$2", "symbols": [{"literal":","}], "postprocess": id},
    {"name": "template_arg_comma_list$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "template_arg_comma_list", "symbols": ["expression", "template_arg_comma_list$ebnf$1", "template_arg_comma_list$ebnf$2"], "postprocess": ([first, rest]) => [first, ...rest.map(tuple => tuple[1])]},
    {"name": "return_type", "symbols": [{"literal":"->"}, "type_specifier"], "postprocess": ([, typespec]) => ({ type: 'return_type', typespec })},
    {"name": "function_decl$ebnf$1", "symbols": []},
    {"name": "function_decl$ebnf$1", "symbols": ["function_decl$ebnf$1", "attribute"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "function_decl", "symbols": ["function_decl$ebnf$1", "function_header", "compound_statement"], "postprocess": ([attrs, header, body]) => ({ type: 'function_decl', header, body, attrs })},
    {"name": "func_argument", "symbols": ["ident", {"literal":":"}, "type_specifier"], "postprocess": ([ident,, typespec]) => ({ type: 'func_argument', ident: ident.value, typespec })},
    {"name": "argument_list$ebnf$1", "symbols": []},
    {"name": "argument_list$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "func_argument"]},
    {"name": "argument_list$ebnf$1", "symbols": ["argument_list$ebnf$1", "argument_list$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "argument_list$ebnf$2", "symbols": [{"literal":","}], "postprocess": id},
    {"name": "argument_list$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "argument_list", "symbols": ["func_argument", "argument_list$ebnf$1", "argument_list$ebnf$2"], "postprocess": ([first, rest]) => [first, ...rest.map(tuple => tuple[1])]},
    {"name": "function_header$ebnf$1", "symbols": ["argument_list"], "postprocess": id},
    {"name": "function_header$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "function_header$ebnf$2", "symbols": ["return_type"], "postprocess": id},
    {"name": "function_header$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "function_header", "symbols": [{"literal":"fn"}, "ident", {"literal":"("}, "function_header$ebnf$1", {"literal":")"}, "function_header$ebnf$2"], "postprocess": ([ , ident,, args,, returntype]) => ({ type: 'function_header', ident: ident.value, returntype, args })},
    {"name": "return_statement$ebnf$1", "symbols": ["expression"], "postprocess": id},
    {"name": "return_statement$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "return_statement", "symbols": [{"literal":"return"}, "return_statement$ebnf$1"], "postprocess": ([ , expression]) => ({ type: 'return_statement', expression })},
    {"name": "compound_statement$ebnf$1", "symbols": []},
    {"name": "compound_statement$ebnf$1", "symbols": ["compound_statement$ebnf$1", "statement"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "compound_statement", "symbols": [{"literal":"{"}, "compound_statement$ebnf$1", {"literal":"}"}], "postprocess": ([ , statements]) => statements.filter((val) => val !== null)},
    {"name": "statement", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "statement", "symbols": ["return_statement", {"literal":";"}], "postprocess": id},
    {"name": "statement", "symbols": ["if_statement"], "postprocess": id},
    {"name": "statement", "symbols": ["for_statement"], "postprocess": id},
    {"name": "statement", "symbols": ["call_statement", {"literal":";"}], "postprocess": id},
    {"name": "statement", "symbols": ["variable_or_value_statement", {"literal":";"}], "postprocess": id},
    {"name": "statement", "symbols": ["variable_updating_statement", {"literal":";"}], "postprocess": id},
    {"name": "statement", "symbols": ["compound_statement"], "postprocess": id},
    {"name": "variable_updating_statement", "symbols": ["assignment_statement"], "postprocess": id},
    {"name": "variable_updating_statement", "symbols": ["increment_statement"], "postprocess": id},
    {"name": "variable_updating_statement", "symbols": ["decrement_statement"], "postprocess": id},
    {"name": "call_statement", "symbols": ["call_phrase"], "postprocess": ([phrase]) => ({ type: 'call_statement', ident: phrase.ident, args: phrase.args })},
    {"name": "swizzle", "symbols": [(lexer.has("swizzle_name") ? {type: "swizzle_name"} : swizzle_name)], "postprocess": ([value]) => ({ type: 'swizzle', value })},
    {"name": "if_statement$ebnf$1", "symbols": []},
    {"name": "if_statement$ebnf$1", "symbols": ["if_statement$ebnf$1", "else_if_clause"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "if_statement$ebnf$2", "symbols": ["else_clause"], "postprocess": id},
    {"name": "if_statement$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "if_statement", "symbols": ["if_clause", "if_statement$ebnf$1", "if_statement$ebnf$2"], "postprocess": ([if_clause, else_if_clauses, else_clause]) => ({ type: 'if_statement' as const, if_clause, else_if_clauses, else_clause })},
    {"name": "if_clause", "symbols": [{"literal":"if"}, "expression", "compound_statement"], "postprocess": ([ , expression, body]) => ({ type: 'if_clause', expression, body })},
    {"name": "else_if_clause", "symbols": [{"literal":"else"}, {"literal":"if"}, "expression", "compound_statement"], "postprocess": ([ , , expression, body]) => ({ type: 'else_if_clause', expression, body })},
    {"name": "else_clause", "symbols": [{"literal":"else"}, "compound_statement"], "postprocess": ([, body]) => ({ type: 'else_clause', body })},
    {"name": "for_statement$ebnf$1", "symbols": []},
    {"name": "for_statement$ebnf$1", "symbols": ["for_statement$ebnf$1", "attribute"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "for_statement", "symbols": ["for_statement$ebnf$1", {"literal":"for"}, {"literal":"("}, "for_header", {"literal":")"}, "compound_statement"], "postprocess": ([attrs, , , header, , body]) => ({ type: 'for_statement', attrs, ...header, body })},
    {"name": "for_header$ebnf$1", "symbols": ["for_init"], "postprocess": id},
    {"name": "for_header$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "for_header$ebnf$2", "symbols": ["expression"], "postprocess": id},
    {"name": "for_header$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "for_header$ebnf$3", "symbols": ["for_update"], "postprocess": id},
    {"name": "for_header$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "for_header", "symbols": ["for_header$ebnf$1", {"literal":";"}, "for_header$ebnf$2", {"literal":";"}, "for_header$ebnf$3"], "postprocess": ([init, , check, , update]) => ({ init, check, update })},
    {"name": "for_init", "symbols": ["variable_or_value_statement"], "postprocess": id},
    {"name": "for_init", "symbols": ["variable_updating_statement"], "postprocess": id},
    {"name": "for_init", "symbols": ["func_call_statement"], "postprocess": id},
    {"name": "for_update", "symbols": ["variable_updating_statement"], "postprocess": id},
    {"name": "for_update", "symbols": ["func_call_statement"], "postprocess": id},
    {"name": "variable_or_value_statement", "symbols": ["variable_decl"], "postprocess": id},
    {"name": "variable_or_value_statement", "symbols": ["let_decl"], "postprocess": id},
    {"name": "variable_or_value_statement", "symbols": ["value_decl"], "postprocess": id},
    {"name": "let_decl", "symbols": [{"literal":"let"}, "optionally_typed_ident", {"literal":"="}, "expression"], "postprocess": ([ , typed_ident, , expr]) => ({ type: 'let_decl', ...typed_ident, expr })},
    {"name": "variable_decl$ebnf$1", "symbols": ["template_list"], "postprocess": id},
    {"name": "variable_decl$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "variable_decl$ebnf$2$subexpression$1", "symbols": [{"literal":"="}, "expression"]},
    {"name": "variable_decl$ebnf$2", "symbols": ["variable_decl$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "variable_decl$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "variable_decl", "symbols": [{"literal":"var"}, "variable_decl$ebnf$1", "optionally_typed_ident", "variable_decl$ebnf$2"], "postprocess": ([ , template_list, typed_ident, opt_expr]) => ({ type: 'variable_decl', template_list: template_list, ...typed_ident, expr: opt_expr ? opt_expr[1] : null })},
    {"name": "global_variable_decl$ebnf$1", "symbols": []},
    {"name": "global_variable_decl$ebnf$1", "symbols": ["global_variable_decl$ebnf$1", "attribute"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "global_variable_decl", "symbols": ["global_variable_decl$ebnf$1", "variable_decl"], "postprocess": ([attrs, variable_decl]) => ({ type: 'global_variable_decl', attributes: attrs, variable_decl })},
    {"name": "optionally_typed_ident$ebnf$1$subexpression$1", "symbols": [{"literal":":"}, "type_specifier"]},
    {"name": "optionally_typed_ident$ebnf$1", "symbols": ["optionally_typed_ident$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "optionally_typed_ident$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "optionally_typed_ident", "symbols": ["ident", "optionally_typed_ident$ebnf$1"], "postprocess": ([ident, typespec]) => ({ ident: ident.value, typespec: typespec ? typespec[1] : null })},
    {"name": "value_decl", "symbols": [{"literal":"const"}, "optionally_typed_ident", {"literal":"="}, "expression"], "postprocess": ([ , typed_ident, , expr]) => ({ type: 'value_decl', ...typed_ident, expr })},
    {"name": "override_decl$ebnf$1", "symbols": []},
    {"name": "override_decl$ebnf$1", "symbols": ["override_decl$ebnf$1", "attribute"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "override_decl$ebnf$2$subexpression$1", "symbols": [{"literal":"="}, "expression"]},
    {"name": "override_decl$ebnf$2", "symbols": ["override_decl$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "override_decl$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "override_decl", "symbols": ["override_decl$ebnf$1", {"literal":"override"}, "optionally_typed_ident", "override_decl$ebnf$2"], "postprocess": ([attrs, , typed_ident, opt_expr]) => ({ type: 'override_decl', attrs, ...typed_ident, expr: opt_expr ? opt_expr[1] : null })},
    {"name": "literal", "symbols": ["int_literal"], "postprocess": id},
    {"name": "literal", "symbols": ["float_literal"], "postprocess": id},
    {"name": "literal", "symbols": ["bool_literal"], "postprocess": id},
    {"name": "int_literal", "symbols": [(lexer.has("decimal_int_literal") ? {type: "decimal_int_literal"} : decimal_int_literal)], "postprocess": ([token]) => ({ type: 'int_literal', value: token.value })},
    {"name": "int_literal", "symbols": [(lexer.has("hex_int_literal") ? {type: "hex_int_literal"} : hex_int_literal)], "postprocess": ([token]) => ({ type: 'int_literal', value: token.value })},
    {"name": "float_literal", "symbols": [(lexer.has("decimal_float_literal") ? {type: "decimal_float_literal"} : decimal_float_literal)], "postprocess": ([token]) => ({ type: 'float_literal', value: token.value })},
    {"name": "float_literal", "symbols": [(lexer.has("hex_float_literal") ? {type: "hex_float_literal"} : hex_float_literal)], "postprocess": ([token]) => ({ type: 'float_literal', value: token.value })},
    {"name": "bool_literal", "symbols": [{"literal":"true"}], "postprocess": () => ({ type: 'bool_literal', value: 'true' })},
    {"name": "bool_literal", "symbols": [{"literal":"false"}], "postprocess": () => ({ type: 'bool_literal', value: 'false' })},
    {"name": "primary_expression", "symbols": ["template_elaborated_ident"], "postprocess": id},
    {"name": "primary_expression", "symbols": ["call_expression"], "postprocess": id},
    {"name": "primary_expression", "symbols": ["literal"], "postprocess": id},
    {"name": "primary_expression", "symbols": ["paren_expression"], "postprocess": id},
    {"name": "call_expression", "symbols": ["call_phrase"], "postprocess": ([phrase]) => ({ type: 'call_expression', ident: phrase.ident, args: phrase.args })},
    {"name": "paren_expression", "symbols": [{"literal":"("}, "expression", {"literal":")"}], "postprocess": ([ , expression]) => ({ type: 'paren_expression', expression })},
    {"name": "argument_expression_list$ebnf$1", "symbols": ["expression_comma_list"], "postprocess": id},
    {"name": "argument_expression_list$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "argument_expression_list", "symbols": [{"literal":"("}, "argument_expression_list$ebnf$1", {"literal":")"}], "postprocess": ([ , list]) => list ?? []},
    {"name": "expression_comma_list$ebnf$1", "symbols": []},
    {"name": "expression_comma_list$ebnf$1$subexpression$1", "symbols": [{"literal":","}, "expression"]},
    {"name": "expression_comma_list$ebnf$1", "symbols": ["expression_comma_list$ebnf$1", "expression_comma_list$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "expression_comma_list$ebnf$2", "symbols": [{"literal":","}], "postprocess": id},
    {"name": "expression_comma_list$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "expression_comma_list", "symbols": ["expression", "expression_comma_list$ebnf$1", "expression_comma_list$ebnf$2"], "postprocess": ([first, rest]) => [first, ...rest.map(tuple => tuple[1])]},
    {"name": "component_or_swizzle_specifier$ebnf$1", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"["}, "expression", {"literal":"]"}, "component_or_swizzle_specifier$ebnf$1"], "postprocess": ([ , index, , next]) => ({ type: 'index_accessor', index, next })},
    {"name": "component_or_swizzle_specifier$ebnf$2", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"."}, "ident", "component_or_swizzle_specifier$ebnf$2"], "postprocess": ([ , ident, next]) => ({ type: 'member_accessor', member: ident.value, next })},
    {"name": "component_or_swizzle_specifier$ebnf$3", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"."}, "swizzle", "component_or_swizzle_specifier$ebnf$3"], "postprocess": ([ , swizzle, next]) => ({ type: 'swizzle_accessor', swizzle, next })},
    {"name": "singular_expression", "symbols": ["primary_expression"], "postprocess": id},
    {"name": "singular_expression", "symbols": ["primary_expression", "component_or_swizzle_specifier"], "postprocess": ([expression, accessor]) => ({ type: 'accessor', expression, accessor })},
    {"name": "unary_expression", "symbols": ["singular_expression"], "postprocess": id},
    {"name": "unary_expression", "symbols": [{"literal":"-"}, "unary_expression"], "postprocess": ([ , expression]) => ({ type: 'negate', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"!"}, "unary_expression"], "postprocess": ([ , expression]) => ({ type: 'logic_not', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"~"}, "unary_expression"], "postprocess": ([ , expression]) => ({ type: 'binary_not', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"*"}, "unary_expression"], "postprocess": ([ , expression]) => ({ type: 'deref', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"&"}, "unary_expression"], "postprocess": ([ , expression]) => ({ type: 'ref', expression })},
    {"name": "lhs_expression$ebnf$1", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "lhs_expression$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "lhs_expression", "symbols": ["core_lhs_expression", "lhs_expression$ebnf$1"], "postprocess": ([expression, accessor]) => ({ type: 'access_expr', expression, accessor })},
    {"name": "lhs_expression", "symbols": [{"literal":"*"}, "lhs_expression"], "postprocess": ([ , expression]) => ({ type: 'deref', expression })},
    {"name": "lhs_expression", "symbols": [{"literal":"&"}, "lhs_expression"], "postprocess": ([ , expression]) => ({ type: 'ref', expression })},
    {"name": "core_lhs_expression", "symbols": ["ident"], "postprocess": id},
    {"name": "core_lhs_expression", "symbols": [{"literal":"("}, "lhs_expression", {"literal":")"}], "postprocess": ([ , expression]) => ({ type: 'paren_expression', expression })},
    {"name": "multiplicative_operator", "symbols": [{"literal":"*"}], "postprocess": () => 'multiply'},
    {"name": "multiplicative_operator", "symbols": [{"literal":"/"}], "postprocess": () => 'divide'},
    {"name": "multiplicative_operator", "symbols": [{"literal":"%"}], "postprocess": () => 'mod'},
    {"name": "additive_operator", "symbols": [{"literal":"+"}], "postprocess": () => 'add'},
    {"name": "additive_operator", "symbols": [{"literal":"-"}], "postprocess": () => 'subtract'},
    {"name": "shift_operator", "symbols": [{"literal":"<<"}], "postprocess": () => 'shift_left'},
    {"name": "shift_operator", "symbols": [{"literal":">>"}], "postprocess": () => 'shift_right'},
    {"name": "relational_operator", "symbols": [{"literal":"<"}], "postprocess": () => 'less_than'},
    {"name": "relational_operator", "symbols": [{"literal":">"}], "postprocess": () => 'greater_than'},
    {"name": "relational_operator", "symbols": [{"literal":"<="}], "postprocess": () => 'less_than_equal'},
    {"name": "relational_operator", "symbols": [{"literal":">="}], "postprocess": () => 'greater_than_equal'},
    {"name": "relational_operator", "symbols": [{"literal":"=="}], "postprocess": () => 'equal'},
    {"name": "relational_operator", "symbols": [{"literal":"!="}], "postprocess": () => 'not_equal'},
    {"name": "multiplicative_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "multiplicative_expression", "symbols": ["multiplicative_expression", "multiplicative_operator", "unary_expression"], "postprocess": ([lhs, type, rhs]) => ({ type, lhs, rhs })},
    {"name": "additive_expression", "symbols": ["multiplicative_expression"], "postprocess": id},
    {"name": "additive_expression", "symbols": ["additive_expression", "additive_operator", "multiplicative_expression"], "postprocess": ([lhs, type, rhs]) => ({ type, lhs, rhs })},
    {"name": "shift_expression", "symbols": ["additive_expression"], "postprocess": id},
    {"name": "shift_expression", "symbols": ["unary_expression", "shift_operator", "unary_expression"], "postprocess": ([lhs, type, rhs]) => ({ type, lhs, rhs })},
    {"name": "relational_expression", "symbols": ["shift_expression"], "postprocess": id},
    {"name": "relational_expression", "symbols": ["shift_expression", "relational_operator", "shift_expression"], "postprocess": ([lhs, type, rhs]) => ({ type, lhs, rhs })},
    {"name": "short_circuit_and_expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "short_circuit_and_expression", "symbols": ["short_circuit_and_expression", {"literal":"&&"}, "relational_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'logic_and', lhs, rhs })},
    {"name": "short_circuit_or_expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "short_circuit_or_expression", "symbols": ["short_circuit_or_expression", {"literal":"||"}, "relational_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'logic_or', lhs, rhs })},
    {"name": "binary_and_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_and_expression", "symbols": ["binary_and_expression", {"literal":"&"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_and', lhs, rhs })},
    {"name": "binary_or_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_or_expression", "symbols": ["binary_or_expression", {"literal":"|"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_or', lhs, rhs })},
    {"name": "binary_xor_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_xor_expression", "symbols": ["binary_xor_expression", {"literal":"^"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_xor', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_and_expression", {"literal":"&"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_and', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_or_expression", {"literal":"|"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_or', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_xor_expression", {"literal":"^"}, "unary_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'binary_xor', lhs, rhs })},
    {"name": "expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "expression", "symbols": ["short_circuit_and_expression", {"literal":"&&"}, "relational_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'logic_and', lhs, rhs })},
    {"name": "expression", "symbols": ["short_circuit_or_expression", {"literal":"||"}, "relational_expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'logic_or', lhs, rhs })},
    {"name": "expression", "symbols": ["bitwise_expression"], "postprocess": id},
    {"name": "call_phrase", "symbols": ["template_elaborated_ident", "argument_expression_list"], "postprocess": ([ident, args]) => ({ ident, args })},
    {"name": "attribute$ebnf$1", "symbols": ["argument_expression_list"], "postprocess": id},
    {"name": "attribute$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "attribute", "symbols": [{"literal":"@"}, "ident", "attribute$ebnf$1"], "postprocess": ([ , ident, args]) => ({ type: 'attribute', ident: ident.value, args: args ?? [] })},
    {"name": "assignment_statement", "symbols": ["lhs_expression", {"literal":"="}, "expression"], "postprocess": ([lhs, , rhs]) => ({ type: 'assignment_statement', lhs, op: '=', rhs })},
    {"name": "assignment_statement", "symbols": ["lhs_expression", "compound_assignment_operator", "expression"], "postprocess": ([lhs, op, rhs]) => ({ type: 'assignment_statement', lhs, op: op.value, rhs })},
    {"name": "assignment_statement", "symbols": [{"literal":"_"}, {"literal":"="}, "expression"], "postprocess": ([ , , rhs]) => ({ type: 'assignment_statement', lhs: '_', op: '=', rhs })},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"+="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"-="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"*="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"/="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"%="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"&="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"|="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"^="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":">>="}], "postprocess": id},
    {"name": "compound_assignment_operator", "symbols": [{"literal":"<<="}], "postprocess": id},
    {"name": "increment_statement", "symbols": ["lhs_expression", {"literal":"++"}], "postprocess": ([expression]) => ({ type: 'increment_statement', expression })},
    {"name": "decrement_statement", "symbols": ["lhs_expression", {"literal":"--"}], "postprocess": ([expression]) => ({ type: 'decrement_statement', expression })}
  ],
  ParserStart: "main",
};

export default grammar;
