import { describe, expect, it } from 'vitest';
import {
  parseImportStatement as parse,
  tokenizeImportStatement as tokenize,
} from './parseExampleCode';

describe('tokenizeImportStatement', () => {
  it('tokenizes an inline import', () => {
    const code = `import "module"`;
    const expected = ['import', { literal: 'module' }];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes a list of named imports', () => {
    const code = `import { one, two } from "module"`;
    const expected = [
      'import',
      '{',
      { id: 'one' },
      ',',
      { id: 'two' },
      '}',
      'from',
      { literal: 'module' },
    ];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes a list of named imports (non-standard whitespace)', () => {
    const code = `import{   one,two   }  from "module";`;
    const expected = [
      'import',
      '{',
      { id: 'one' },
      ',',
      { id: 'two' },
      '}',
      'from',
      { literal: 'module' },
      ';',
    ];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes default and a list of named imports', () => {
    const code = `import Module, { one, two } from "module"`;
    const expected = [
      'import',
      { id: 'Module' },
      ',',
      '{',
      { id: 'one' },
      ',',
      { id: 'two' },
      '}',
      'from',
      { literal: 'module' },
    ];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes default import', () => {
    const code = `import Module from "module"`;
    const expected = [
      'import',
      { id: 'Module' },
      'from',
      { literal: 'module' },
    ];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes alias of all', () => {
    const code = `import * as All from "module"`;
    const expected = [
      'import',
      '*',
      'as',
      { id: 'All' },
      'from',
      { literal: 'module' },
    ];
    expect(tokenize(code)).toEqual(expected);
  });

  it('tokenizes alias of named imports', () => {
    const code = `import {
      one as One,
      two as Two,
      three
    } from 'module'`;

    const expected = [
      'import',
      '{',
      { id: 'one' },
      'as',
      { id: 'One' },
      ',',
      { id: 'two' },
      'as',
      { id: 'Two' },
      ',',
      { id: 'three' },
      '}',
      'from',
      { literal: 'module' },
    ];
    expect(tokenize(code)).toEqual(expected);
  });
});

describe('parseImportStatement', () => {
  it('parses named imports', () => {
    const expected = {
      allAlias: null,
      defaultAlias: null,
      namedImports: { one: 'one', two: 'two' },
      moduleName: 'module_name',
    };

    expect(parse(tokenize(`import { one, two } from "module_name"`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import{one,two} from 'module_name'`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import {one,   two } from "module_name";`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import { one, two } from 'module_name';`))).toEqual(
      expected,
    );
  });

  it('parses default import', () => {
    const expected = {
      allAlias: null,
      defaultAlias: 'Module',
      namedImports: {},
      moduleName: 'module_name',
    };

    expect(parse(tokenize(`import Module from "module_name"`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import Module  from 'module_name'`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import Module from  "module_name";`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import Module from 'module_name';`))).toEqual(
      expected,
    );
  });

  it('parses default and named imports', () => {
    const expected = {
      allAlias: null,
      defaultAlias: 'Module',
      namedImports: { one: 'one', two: 'Two' },
      moduleName: 'module_name',
    };

    expect(
      parse(tokenize(`import Module, { one, two as Two } from "module_name"`)),
    ).toEqual(expected);
    expect(
      parse(tokenize(`import Module, { one, two as Two }  from 'module_name'`)),
    ).toEqual(expected);
    expect(
      parse(
        tokenize(`import Module, { one, two as Two } from  "module_name";`),
      ),
    ).toEqual(expected);
    expect(
      parse(tokenize(`import Module, { one, two as Two } from 'module_name';`)),
    ).toEqual(expected);
  });

  it('parses all alias', () => {
    const expected = {
      allAlias: 'All',
      defaultAlias: null,
      namedImports: {},
      moduleName: 'module_name',
    };

    expect(parse(tokenize(`import * as All from "module_name"`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import * as All from 'module_name'`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import * as All from  "module_name";`))).toEqual(
      expected,
    );
    expect(parse(tokenize(`import * as All from 'module_name';`))).toEqual(
      expected,
    );
  });
});
