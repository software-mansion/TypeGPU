import ts from 'typescript';
import MagicString from 'magic-string';
import { readdir } from 'fs/promises';
import { basename, dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { writeFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const examplesDir = join(projectRoot, 'src', 'examples');

const operatorToMethod: Record<string, string> = {
  [ts.SyntaxKind.PlusToken]: 'add',
  [ts.SyntaxKind.PlusEqualsToken]: 'add',
  [ts.SyntaxKind.MinusToken]: 'sub',
  [ts.SyntaxKind.MinusEqualsToken]: 'sub',
  [ts.SyntaxKind.AsteriskToken]: 'mul',
  [ts.SyntaxKind.AsteriskEqualsToken]: 'mul',
  [ts.SyntaxKind.SlashToken]: 'div',
  [ts.SyntaxKind.SlashEqualsToken]: 'div',
  [ts.SyntaxKind.AsteriskAsteriskToken]: 'pow',
  [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: 'pow',
};

const assignmentOperators = [
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
];

const commutativeMethods = ['add', 'mul'];

async function findTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (
          (ext === '.ts' || ext === '.tsx') &&
          !entry.name.endsWith('.d.ts') &&
          !entry.name.endsWith('.d.tsx') &&
          !entry.name.endsWith('.tsnotover.ts') &&
          !entry.name.endsWith('.tsnotover.tsx')
        ) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

type Pattern =
  | 'left.op(right)' // e.g. vec + 2 => vec.add(2)
  | 'right.op(left)' // e.g. 2 * vec => vec.mul(2)
  | 'std.op(left, right)'; // e.g. 2 / vec => std.div(2, vec)

function getOverloadPattern(
  checker: ts.TypeChecker,
  node: ts.BinaryExpression,
): Pattern | undefined {
  const methodName = operatorToMethod[node.operatorToken.kind];
  if (!methodName) {
    // Not overlaoded
    return undefined;
  }

  // Get the types of both operands
  const leftType = checker.getTypeAtLocation(node.left);
  const rightType = checker.getTypeAtLocation(node.right);

  if (
    !checker.__tsover__couldHaveOverloadedOperators(
      node.left,
      node.operatorToken.kind,
      node.right,
      leftType,
      rightType,
    )
  ) {
    // Not overlaoded
    return undefined;
  }

  // For non-commutative operators, use the standard library function
  if (!commutativeMethods.includes(methodName)) {
    return 'std.op(left, right)';
  }

  // Since other supported operators are commutative, prefer left method, fall back to right
  const leftHasMethod = leftType.getProperty(methodName) !== undefined;

  return leftHasMethod ? 'left.op(right)' : 'right.op(left)';
}

function createProgram(allFiles: string[]): ts.Program {
  const configPath = join(projectRoot, 'tsconfig.json');
  const configText = ts.sys.readFile(configPath);

  if (!configText) {
    throw new Error(`Could not read tsconfig.json at ${configPath}`);
  }

  const { config } = ts.parseConfigFileTextToJson(configPath, configText);
  const parsedConfig = ts.parseJsonConfigFileContent(config, ts.sys, projectRoot);

  const compilerOptions: ts.CompilerOptions = {
    ...parsedConfig.options,
    noEmit: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);

  return ts.createProgram(allFiles, compilerOptions, host);
}

function isStdDeclared(sourceFile: ts.SourceFile): boolean {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) {
      continue;
    }
    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }
    const namedBindings = stmt.importClause?.namedBindings;
    // Case 1: import { std } from 'typegpu'
    if (
      moduleSpecifier.text === 'typegpu' &&
      namedBindings &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.some((el) => el.name.text === 'std')
    ) {
      return true;
    }
    // Case 2: import * as std from 'typegpu/std'
    if (
      moduleSpecifier.text === 'typegpu/std' &&
      namedBindings &&
      ts.isNamespaceImport(namedBindings) &&
      namedBindings.name.text === 'std'
    ) {
      return true;
    }
  }
  return false;
}

function transformFile(
  sourceFilePath: string,
  program: ts.Program,
): { code: string; hasChanges: boolean } {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(sourceFilePath);

  if (!sourceFile) {
    throw new Error(`Could not get source file for ${sourceFilePath}`);
  }

  const sourceText = sourceFile.text;
  const magic = new MagicString(sourceText);
  let hasChanges = false;
  let needsStd = false;

  function visit(node: ts.Node): void {
    // Visit all children of the node first, then process the node itself
    ts.forEachChild(node, visit);

    if (!ts.isBinaryExpression(node)) {
      return;
    }

    const pattern = getOverloadPattern(checker, node);
    const methodName = operatorToMethod[node.operatorToken.kind];

    if (!pattern || !methodName) {
      return;
    }

    hasChanges = true;

    const start = node.getStart();
    const end = node.getEnd();
    const leftStart = node.left.getStart();
    const leftEnd = node.left.getEnd();
    const rightStart = node.right.getStart();
    const rightEnd = node.right.getEnd();

    const leftText = magic.slice(leftStart, leftEnd);
    const rightText = magic.slice(rightStart, rightEnd);

    let replacement = '';
    if (pattern === 'std.op(left, right)') {
      needsStd = true;
      replacement = `std.${methodName}(${leftText}, ${rightText})`;
    } else if (pattern === 'left.op(right)') {
      replacement = `${leftText}.${methodName}(${rightText})`;
    } else if (pattern === 'right.op(left)') {
      replacement = `${rightText}.${methodName}(${leftText})`;
    } else {
      throw new Error(`Unsupported pattern: ${pattern}`);
    }

    if (assignmentOperators.includes(node.operatorToken.kind)) {
      // E.g. transforms a += b into a = a.add(b)
      magic.overwrite(start, end, `${leftText} = ${replacement}`);
    } else {
      magic.overwrite(start, end, replacement);
    }
  }

  visit(sourceFile);

  if (needsStd && !isStdDeclared(sourceFile)) {
    magic.prepend("import { std } from 'typegpu';\n");
  }

  return { code: magic.toString(), hasChanges };
}

async function main() {
  console.log('Finding TypeScript files in examples directory...');

  const allFiles = await findTypeScriptFiles(examplesDir);

  console.log(`Found ${allFiles.length} files to process`);
  console.log('Creating TypeScript program...');

  const program = createProgram(allFiles);

  console.log('Transforming files...');

  let transformedCount = 0;
  let errorCount = 0;

  for (const filePath of allFiles) {
    try {
      const { code, hasChanges } = transformFile(filePath, program);

      const ext = filePath.endsWith('.tsx') ? '.tsx' : '.ts';
      const baseName = basename(filePath, ext);
      const dir = dirname(filePath);
      const outputPath = join(dir, `${baseName}.tsnotover${ext}`);

      if (hasChanges) {
        transformedCount++;
        await writeFile(outputPath, code, 'utf-8');
        console.log(`Transformed: ${relative(projectRoot, filePath)}`);
      }
    } catch (error) {
      errorCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${relative(projectRoot, filePath)}: ${errorMessage}`);
      throw new Error(`Failed to transform ${relative(projectRoot, filePath)}: ${errorMessage}`, {
        cause: error,
      });
    }
  }

  console.log(`\nDone! Transformed ${transformedCount} files, ${errorCount} errors.`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
