import nearley from 'nearley';
import grammar from './grammar';

export function parse(code: string) {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  parser.feed(code);

  return parser.results[0];
}
