import nearley from 'nearley';
import grammar, { Main } from './grammar';

export function parse(code: string): Main {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(code);

  return parser.results[0];
}
