import { parse } from './src';

console.log(
  JSON.stringify(
    parse(`
fn some() {
  if 5 > 6 {
  }
}
`),
    undefined,
    2,
  ),
);
