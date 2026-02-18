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
  [ts.SyntaxKind.MinusToken]: 'sub',
  [ts.SyntaxKind.AsteriskToken]: 'mul',
  [ts.SyntaxKind.SlashToken]: 'div',
};

const compoundToBaseOperator: Record<string, ts.BinaryOperator> = {
  [ts.SyntaxKind.PlusEqualsToken]: ts.SyntaxKind.PlusToken,
  [ts.SyntaxKind.MinusEqualsToken]: ts.SyntaxKind.MinusToken,
  [ts.SyntaxKind.AsteriskEqualsToken]: ts.SyntaxKind.AsteriskToken,
  [ts.SyntaxKind.SlashEqualsToken]: ts.SyntaxKind.SlashToken,
};

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

function isOverloadedBinary(
  node: ts.BinaryExpression,
  checker: ts.TypeChecker,
): { isOverloaded: boolean; useLeftMethod: boolean } {
  const methodName = operatorToMethod[node.operatorToken.kind];
  if (!methodName) {
    return { isOverloaded: false, useLeftMethod: false };
  }

  // Get the types of both operands
  const leftType = checker.getTypeAtLocation(node.left);
  const rightType = checker.getTypeAtLocation(node.right);

  const overloadType = checker.__tsover__getOverloadReturnType(
    node.left,
    node.operatorToken.kind,
    node.right,
    leftType,
    rightType,
  );

  if (!overloadType) {
    return { isOverloaded: false, useLeftMethod: false };
  }

  // For division, only use left method
  if (node.operatorToken.kind === ts.SyntaxKind.SlashToken) {
    return { isOverloaded: true, useLeftMethod: true };
  }

  // For other operators, prefer left method, fall back to right
  const leftHasMethod = leftType.getProperty(methodName) !== undefined;

  return { isOverloaded: true, useLeftMethod: leftHasMethod };
}

function isOverloadedCompoundAssignment(
  node: ts.BinaryExpression,
  checker: ts.TypeChecker,
): { isOverloaded: boolean; baseOperator: ts.SyntaxKind | undefined } {
  const baseOperator = compoundToBaseOperator[node.operatorToken.kind];
  if (!baseOperator) {
    return { isOverloaded: false, baseOperator: undefined };
  }

  const methodName = operatorToMethod[baseOperator];
  if (!methodName) {
    return { isOverloaded: false, baseOperator: undefined };
  }

  // Get the types of both operands
  const leftType = checker.getTypeAtLocation(node.left);
  const rightType = checker.getTypeAtLocation(node.right);

  const overloadType = checker.__tsover__getOverloadReturnType(
    node.left,
    baseOperator,
    node.right,
    leftType,
    rightType,
  );

  if (!overloadType) {
    return { isOverloaded: false, baseOperator: undefined };
  }

  // Check if left operand has the method (compound assignment only uses left method)
  const leftHasMethod = leftType.getProperty(methodName) !== undefined;

  return { isOverloaded: leftHasMethod, baseOperator };
}

function createProgram(allFiles: string[]): ts.Program {
  const configPath = join(projectRoot, 'tsconfig.json');
  const configText = ts.sys.readFile(configPath);

  if (!configText) {
    throw new Error(`Could not read tsconfig.json at ${configPath}`);
  }

  const { config } = ts.parseConfigFileTextToJson(configPath, configText);
  const parsedConfig = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    projectRoot,
  );

  const compilerOptions: ts.CompilerOptions = {
    ...parsedConfig.options,
    noEmit: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);

  return ts.createProgram(allFiles, compilerOptions, host);
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

  function visit(node: ts.Node): void {
    ts.forEachChild(node, visit);

    if (ts.isBinaryExpression(node)) {
      const { isOverloaded, useLeftMethod } = isOverloadedBinary(node, checker);

      if (isOverloaded) {
        const methodName = operatorToMethod[node.operatorToken.kind];
        if (methodName) {
          hasChanges = true;

          const start = node.getStart();
          const end = node.getEnd();
          const leftStart = node.left.getStart();
          const leftEnd = node.left.getEnd();
          const rightStart = node.right.getStart();
          const rightEnd = node.right.getEnd();

          const leftText = magic.slice(leftStart, leftEnd);
          const rightText = magic.slice(rightStart, rightEnd);

          if (useLeftMethod) {
            magic.overwrite(
              start,
              end,
              `${leftText}.${methodName}(${rightText})`,
            );
          } else {
            magic.overwrite(
              start,
              end,
              `${rightText}.${methodName}(${leftText})`,
            );
          }
        }
      }

      // Handle compound assignment operators (+=, -=, *=, /=)
      const { isOverloaded: isCompoundOverloaded, baseOperator } =
        isOverloadedCompoundAssignment(node, checker);

      if (isCompoundOverloaded && baseOperator) {
        const methodName = operatorToMethod[baseOperator];
        if (methodName) {
          hasChanges = true;

          const start = node.getStart();
          const end = node.getEnd();
          const leftStart = node.left.getStart();
          const leftEnd = node.left.getEnd();
          const rightStart = node.right.getStart();
          const rightEnd = node.right.getEnd();

          const leftText = magic.slice(leftStart, leftEnd);
          const rightText = magic.slice(rightStart, rightEnd);

          // Transform a += b into a = a.add(b)
          magic.overwrite(
            start,
            end,
            `${leftText} = ${leftText}.${methodName}(${rightText})`,
          );
        }
      }
    }
  }

  visit(sourceFile);

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
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(
        `Error processing ${relative(projectRoot, filePath)}: ${errorMessage}`,
      );
      throw new Error(
        `Failed to transform ${
          relative(projectRoot, filePath)
        }: ${errorMessage}`,
        { cause: error },
      );
    }
  }

  console.log(
    `\nDone! Transformed ${transformedCount} files, ${errorCount} errors.`,
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
