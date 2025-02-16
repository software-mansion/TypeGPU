import nearley from 'nearley';
import grammar, { type Main } from './grammar.ne';

export function parse(code: string): Main {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(code);

  return parser.results[0];
}

export type * from './grammar.ne';
