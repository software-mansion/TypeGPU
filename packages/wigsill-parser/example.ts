import { parse } from './src';

console.log(JSON.stringify(parse('fn some() {}'), undefined, 2));
