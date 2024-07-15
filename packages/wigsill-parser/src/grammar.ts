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
declare var bool_literal: any;
declare var WS: any;
declare var NL: any;

import moo from 'moo';

const lexer = moo.compile({
  WS:      /[ \t\v\f]+/,
  NL:      { match: /\n/, lineBreaks: true },
  keyword: ['if', 'else'],
  comment: /\/\/.*?$/,
  semi: ";",
  bool_literal: ['true', 'false'],
  decimal_int_literal: { match: /(?:0|[1-9][0-9]*)[iu]?/ },
  hex_int_literal: { match: /0[xX][0-9a-fA-F]+[iu]?/ },
  decimal_float_literal: /0[fh]|[1-9][0-9]*[fh]|[0-9]*\.[0-9]+(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+\.[0-9]*(?:[eE][+-]?[0-9]+)?[fh]?|[0-9]+[eE][+-]?[0-9]+[fh]?/,
  hex_float_literal: /0[xX][0-9a-fA-F]*\.[0-9a-fA-F]+(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+\.[0-9a-fA-F]*(?:[pP][+-]?[0-9]+[fh]?)?|0[xX][0-9a-fA-F]+[pP][+-]?[0-9]+[fh]?/,

  // WGSL spec apparently accepts plenty of Unicode, but lets limit it to just ASCII for now.
  ident_pattern: /\w+/,
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



export type TranslationUnit = { declarations: GlobalDecl[] };


export type GlobalDecl = null | FunctionDecl;


export type Ident = { type: 'ident', value: string };


export type FunctionDecl = { type: 'function_decl', header: FunctionHeader, body: CompoundStatement };

export type FunctionHeader = ReturnType<typeof pp_function_header>;
function pp_function_header([ , , identifier]: [any, any, Identifier]) {
  return { type: 'function_header' as const, identifier: identifier.value };
}


export type CompoundStatement = Statement[];



type Swizzle = { type: 'swizzle', value: string };


export type Literal = BoolLiteral | IntLiteral | FloatLiteral;

export type IntLiteral = { type: 'int_literal', value: string };
export type FloatLiteral = { type: 'float_literal', value: string };
export type BoolLiteral = { type: 'bool_literal', value: 'true' | 'false' };

function pp_literal([token]: [{ type: string, value: string }]): Literal {
  return { type: token.type, value: token.value };
}


export type PrimaryExpression =
// template_elaborated_ident
// | call_expression
    Literal
  | ParenExpression



export type ParenExpression = { type: 'paren_expression', expression: Expression };



export type Accessor =
    { type: 'index_accessor', index: Expression, next: Accessor | null }
  | { type: 'member_accessor', member: Ident, next: Accessor | null }
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
    {"name": "translation_unit$ebnf$1", "symbols": []},
    {"name": "translation_unit$ebnf$1$subexpression$1", "symbols": ["global_decl", "_"]},
    {"name": "translation_unit$ebnf$1", "symbols": ["translation_unit$ebnf$1", "translation_unit$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "translation_unit", "symbols": ["_", "translation_unit$ebnf$1"], "postprocess": ([ , declarationTuples]) => ({ declarations: declarationTuples.map((tuple) => tuple[0]) })},
    {"name": "global_directive", "symbols": [{"literal":"else"}]},
    {"name": "global_decl", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "global_decl", "symbols": ["function_decl"], "postprocess": id},
    {"name": "ident", "symbols": [(lexer.has("ident_pattern") ? {type: "ident_pattern"} : ident_pattern)], "postprocess": ([token]) => ({ type: 'ident', value: token.value })},
    {"name": "global_variable_decl", "symbols": [{"literal":"if"}]},
    {"name": "global_value_decl", "symbols": []},
    {"name": "type_alias_decl", "symbols": []},
    {"name": "struct_decl", "symbols": []},
    {"name": "const_assert_statement", "symbols": []},
    {"name": "function_decl", "symbols": ["function_header", "_", "compound_statement"], "postprocess": ([header, , body]) => ({ type: 'function_decl', header, body })},
    {"name": "function_header", "symbols": [{"literal":"fn"}, "__", "ident", "_", {"literal":"("}, "_", {"literal":")"}], "postprocess": pp_function_header},
    {"name": "compound_statement$ebnf$1", "symbols": []},
    {"name": "compound_statement$ebnf$1", "symbols": ["compound_statement$ebnf$1", "statement"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "compound_statement", "symbols": [{"literal":"{"}, "_", "compound_statement$ebnf$1", "_", {"literal":"}"}], "postprocess": ([ , , statements]) => statements},
    {"name": "statement", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "statement", "symbols": ["if_statement"], "postprocess": id},
    {"name": "swizzle", "symbols": [(lexer.has("swizzle_name") ? {type: "swizzle_name"} : swizzle_name)], "postprocess": ([value]) => ({ type: 'swizzle', value })},
    {"name": "literal", "symbols": ["int_literal"], "postprocess": id},
    {"name": "literal", "symbols": ["float_literal"], "postprocess": id},
    {"name": "literal", "symbols": ["bool_literal"], "postprocess": id},
    {"name": "int_literal", "symbols": [(lexer.has("decimal_int_literal") ? {type: "decimal_int_literal"} : decimal_int_literal)], "postprocess": pp_literal},
    {"name": "int_literal", "symbols": [(lexer.has("hex_int_literal") ? {type: "hex_int_literal"} : hex_int_literal)], "postprocess": pp_literal},
    {"name": "float_literal", "symbols": [(lexer.has("decimal_float_literal") ? {type: "decimal_float_literal"} : decimal_float_literal)], "postprocess": pp_literal},
    {"name": "float_literal", "symbols": [(lexer.has("hex_float_literal") ? {type: "hex_float_literal"} : hex_float_literal)], "postprocess": pp_literal},
    {"name": "bool_literal", "symbols": [(lexer.has("bool_literal") ? {type: "bool_literal"} : bool_literal)], "postprocess": pp_literal},
    {"name": "primary_expression", "symbols": ["literal"], "postprocess": id},
    {"name": "primary_expression", "symbols": ["paren_expression"], "postprocess": id},
    {"name": "paren_expression", "symbols": [{"literal":"("}, "_", "expression", "_", {"literal":")"}], "postprocess": ([ , , expression]) => ({ type: 'paren_expression', expression })},
    {"name": "component_or_swizzle_specifier$ebnf$1", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"["}, "_", "expression", "_", {"literal":"]"}, "_", "component_or_swizzle_specifier$ebnf$1"], "postprocess": ([ , , index, , , , next]) => ({ type: 'index_accessor', index, next })},
    {"name": "component_or_swizzle_specifier$ebnf$2", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"."}, "ident", "_", "component_or_swizzle_specifier$ebnf$2"], "postprocess": ([ , ident, , next]) => ({ type: 'member_accessor', member, next })},
    {"name": "component_or_swizzle_specifier$ebnf$3", "symbols": ["component_or_swizzle_specifier"], "postprocess": id},
    {"name": "component_or_swizzle_specifier$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "component_or_swizzle_specifier", "symbols": [{"literal":"."}, "swizzle", "_", "component_or_swizzle_specifier$ebnf$3"], "postprocess": ([ , swizzle, , next]) => ({ type: 'swizzle_accessor', swizzle, next })},
    {"name": "singular_expression", "symbols": ["primary_expression"], "postprocess": id},
    {"name": "singular_expression", "symbols": ["primary_expression", "_", "component_or_swizzle_specifier"], "postprocess": ([expression, , accessor]) => ({ type: 'accessor', expression, accessor })},
    {"name": "unary_expression", "symbols": ["singular_expression"], "postprocess": id},
    {"name": "unary_expression", "symbols": [{"literal":"-"}, "_", "unary_expression"], "postprocess": ([ , , expression]) => ({ type: 'negate', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"!"}, "_", "unary_expression"], "postprocess": ([ , , expression]) => ({ type: 'logic_not', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"~"}, "_", "unary_expression"], "postprocess": ([ , , expression]) => ({ type: 'binary_not', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"*"}, "_", "unary_expression"], "postprocess": ([ , , expression]) => ({ type: 'deref', expression })},
    {"name": "unary_expression", "symbols": [{"literal":"&"}, "_", "unary_expression"], "postprocess": ([ , , expression]) => ({ type: 'ref', expression })},
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
    {"name": "multiplicative_expression", "symbols": ["multiplicative_expression", "_", "multiplicative_operator", "_", "unary_expression"], "postprocess": ([lhs, , type, , rhs]) => ({ type, lhs, rhs })},
    {"name": "additive_expression", "symbols": ["multiplicative_expression"], "postprocess": id},
    {"name": "additive_expression", "symbols": ["additive_expression", "_", "additive_operator", "_", "multiplicative_expression"], "postprocess": ([lhs, , type, , rhs]) => ({ type, lhs, rhs })},
    {"name": "shift_expression", "symbols": ["additive_expression"], "postprocess": id},
    {"name": "shift_expression", "symbols": ["unary_expression", "_", "shift_operator", "_", "unary_expression"], "postprocess": ([lhs, , type, , rhs]) => ({ type, lhs, rhs })},
    {"name": "relational_expression", "symbols": ["shift_expression"], "postprocess": id},
    {"name": "relational_expression", "symbols": ["shift_expression", "_", "relational_operator", "_", "shift_expression"], "postprocess": ([lhs, , type, , rhs]) => ({ type, lhs, rhs })},
    {"name": "short_circuit_and_expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "short_circuit_and_expression", "symbols": ["short_circuit_and_expression", "_", {"literal":"&&"}, "_", "relational_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'logic_and', lhs, rhs })},
    {"name": "short_circuit_or_expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "short_circuit_or_expression", "symbols": ["short_circuit_or_expression", "_", {"literal":"||"}, "_", "relational_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'logic_or', lhs, rhs })},
    {"name": "binary_and_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_and_expression", "symbols": ["binary_and_expression", "_", {"literal":"&"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_and', lhs, rhs })},
    {"name": "binary_or_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_or_expression", "symbols": ["binary_or_expression", "_", {"literal":"|"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_or', lhs, rhs })},
    {"name": "binary_xor_expression", "symbols": ["unary_expression"], "postprocess": id},
    {"name": "binary_xor_expression", "symbols": ["binary_xor_expression", "_", {"literal":"^"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_xor', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_and_expression", "_", {"literal":"&"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_and', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_or_expression", "_", {"literal":"|"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_or', lhs, rhs })},
    {"name": "bitwise_expression", "symbols": ["binary_xor_expression", "_", {"literal":"^"}, "_", "unary_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'binary_xor', lhs, rhs })},
    {"name": "expression", "symbols": ["relational_expression"], "postprocess": id},
    {"name": "expression", "symbols": ["short_circuit_and_expression", "_", {"literal":"&&"}, "_", "relational_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'logic_and', lhs, rhs })},
    {"name": "expression", "symbols": ["short_circuit_or_expression", "_", {"literal":"||"}, "_", "relational_expression"], "postprocess": ([lhs, , , , rhs]) => ({ type: 'logic_or', lhs, rhs })},
    {"name": "expression", "symbols": ["bitwise_expression"], "postprocess": id},
    {"name": "if_statement$ebnf$1", "symbols": []},
    {"name": "if_statement$ebnf$1$subexpression$1", "symbols": ["else_if_clause", "_"]},
    {"name": "if_statement$ebnf$1", "symbols": ["if_statement$ebnf$1", "if_statement$ebnf$1$subexpression$1"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "if_statement$ebnf$2", "symbols": ["else_clause"], "postprocess": id},
    {"name": "if_statement$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "if_statement", "symbols": ["if_clause", "_", "if_statement$ebnf$1", "_", "if_statement$ebnf$2"], "postprocess": pp_if_statement},
    {"name": "if_clause", "symbols": [{"literal":"if"}, "_", "expression", "_", "compound_statement"], "postprocess": pp_if_clause},
    {"name": "else_if_clause", "symbols": [{"literal":"else"}, "__", {"literal":"if"}, "_", "expression", "_", "compound_statement"], "postprocess": pp_else_if_clause},
    {"name": "else_clause", "symbols": [{"literal":"else"}, "_", "compound_statement"], "postprocess": pp_else_clause},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "wschar"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": (d) => null},
    {"name": "__$ebnf$1", "symbols": ["wschar"]},
    {"name": "__$ebnf$1", "symbols": ["__$ebnf$1", "wschar"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "__", "symbols": ["__$ebnf$1"], "postprocess": (d) => null},
    {"name": "wschar", "symbols": [(lexer.has("WS") ? {type: "WS"} : WS)]},
    {"name": "wschar", "symbols": [(lexer.has("NL") ? {type: "NL"} : NL)], "postprocess": id}
  ],
  ParserStart: "translation_unit",
};

export default grammar;
