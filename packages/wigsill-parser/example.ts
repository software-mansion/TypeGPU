import { parse } from './src';

console.log(
  JSON.stringify(
    parse(`
fn some() {
  if true && false {
  }
}
`),
    undefined,
    2,
  ),
);
