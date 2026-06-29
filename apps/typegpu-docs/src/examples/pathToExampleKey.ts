import pathe from 'pathe';
import * as R from 'remeda';

export function pathToExampleKey(path: string): string {
  return R.pipe(
    path,
    (p) => pathe.relative('./', p), // removing parent folder
    (p) => p.split('/'), // splitting into segments
    ([category, name]) => `${category}--${name}`,
  );
}
