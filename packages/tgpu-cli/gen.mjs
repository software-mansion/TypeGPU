import fs from 'node:fs/promises';

const cwd = new URL(`file:${process.cwd()}/`);

async function placeholderGenerate(input, output) {
  const inputPath = new URL(input, cwd);
  const outputPath = new URL(output, cwd);

  const inputContents = await fs.readFile(inputPath, 'utf8');
  const placeholderTS = `
// This file is a placeholder for the actual implementation

export default function placeholder() {
  const input = ${JSON.stringify(inputContents)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')};
  console.log('This is a placeholder function');
  console.log('Input:', input);
  return input;
}
  `;
  await fs.writeFile(outputPath, placeholderTS);
}

export default placeholderGenerate;
