import { parse } from './src';

console.log(
  JSON.stringify(
    parse(`
fn some() {
  if false {
  }
}
`),
    undefined,
    2,
  ),
);
