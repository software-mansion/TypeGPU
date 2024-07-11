/* eslint-disable */
// @ts-nocheck
// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var decimal_int_literal: any;
declare var hex_int_literal: any;
declare var decimal_float_literal: any;
declare var hex_float_literal: any;
declare var ident_pattern: any;
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
    {"name": "translation_unit", "symbols": ["_", "translation_unit$ebnf$1"], "postprocess": pp_translation_unit},
    {"name": "global_directive", "symbols": [{"literal":"else"}]},
    {"name": "global_decl", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "global_decl", "symbols": ["function_decl"], "postprocess": id},
    {"name": "int_literal", "symbols": [(lexer.has("decimal_int_literal") ? {type: "decimal_int_literal"} : decimal_int_literal)]},
    {"name": "int_literal", "symbols": [(lexer.has("hex_int_literal") ? {type: "hex_int_literal"} : hex_int_literal)], "postprocess": id},
    {"name": "float_literal", "symbols": [(lexer.has("decimal_float_literal") ? {type: "decimal_float_literal"} : decimal_float_literal)]},
    {"name": "float_literal", "symbols": [(lexer.has("hex_float_literal") ? {type: "hex_float_literal"} : hex_float_literal)], "postprocess": id},
    {"name": "ident", "symbols": [(lexer.has("ident_pattern") ? {type: "ident_pattern"} : ident_pattern)], "postprocess": id},
    {"name": "global_variable_decl", "symbols": [{"literal":"if"}]},
    {"name": "global_value_decl", "symbols": []},
    {"name": "type_alias_decl", "symbols": []},
    {"name": "struct_decl", "symbols": []},
    {"name": "const_assert_statement", "symbols": []},
    {"name": "function_decl", "symbols": ["function_header", "_", "compound_statement"], "postprocess": pp_function_decl},
    {"name": "function_header", "symbols": [{"literal":"fn"}, "__", "ident", "_", {"literal":"("}, "_", {"literal":")"}], "postprocess": pp_function_header},
    {"name": "compound_statement$ebnf$1", "symbols": []},
    {"name": "compound_statement$ebnf$1", "symbols": ["compound_statement$ebnf$1", "statement"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "compound_statement", "symbols": [{"literal":"{"}, "_", "compound_statement$ebnf$1", "_", {"literal":"}"}], "postprocess": pp_compound_statement},
    {"name": "statement", "symbols": [{"literal":";"}], "postprocess": () => null},
    {"name": "statement", "symbols": ["if_statement"], "postprocess": id},
    {"name": "expression", "symbols": [(lexer.has("bool_literal") ? {type: "bool_literal"} : bool_literal)], "postprocess": id},
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
