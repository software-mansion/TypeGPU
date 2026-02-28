type TestName = string;
type BundlerName = string;
type ResultSize = number | undefined;
type TestResults = Record<BundlerName, ResultSize>;
type Row = Map<BundlerName, { pr: ResultSize; target: ResultSize }>;

export class ResultsTable {
  #bundlers: Set<BundlerName>;
  #results: Map<TestName, Row>;
  #threshold: number;
  constructor(bundlers: Set<BundlerName>, threshold: number) {
    this.#bundlers = bundlers;
    this.#results = new Map();
    this.#threshold = threshold;
  }

  addRow(
    testName: string,
    prResults: TestResults | undefined,
    targetResults: TestResults | undefined,
  ) {
    const row: Row = new Map();
    for (const bundlerName of this.#bundlers) {
      row.set(bundlerName, {
        pr: prResults?.[bundlerName],
        target: targetResults?.[bundlerName],
      });
    }

    if (this.#isInteresting(row)) {
      this.#results.set(testName, row);
    }
  }

  toString() {
    if (this.#results.size === 0) {
      return '*No major changes.*';
    }

    let output = '';
    output += '| Test';
    for (const bundler of this.#bundlers) {
      output += ` | ${bundler}`;
    }
    output += ' |\n';

    output += '|---------';
    for (const _ of this.#bundlers) {
      output += '|---------';
    }
    output += ' |\n';

    for (const [test, row] of this.#results.entries()) {
      output += `| ${test.replaceAll('_', ' ')}`;

      for (const bundler of this.#bundlers) {
        const prSize = row.get(bundler)?.pr;
        const targetSize = row.get(bundler)?.target;

        output += ` | ${prettifySize(prSize)} ${calculateTrendMessage(prSize, targetSize)}`;
      }
      output += ' |\n';
    }
    output += '\n';

    if (this.#results.size > 20) {
      output = `
<details>
<summary><b>${
        this.#threshold > 0 ? '‼️ ' : ''
      }Click to reveal the results table (${this.#results.size} entries).</b></summary>

${output}

</details>`;
    }

    return output;
  }

  #isInteresting(row: Row) {
    for (const cell of row) {
      const pr = cell[1].pr;
      const target = cell[1].target;
      if (pr && target === undefined) {
        return true;
      }
      if (pr && target && Math.max(pr / target, target / pr) >= 1 + this.#threshold) {
        return true;
      }
    }
    return false;
  }
}

function prettifySize(size: number | undefined) {
  if (size === undefined) {
    return 'N/A';
  }
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let sizeInUnits = size;
  while (sizeInUnits > 1024 && unitIndex < units.length) {
    sizeInUnits /= 1024;
    unitIndex += 1;
  }
  return `${
    Number.isInteger(sizeInUnits) ? sizeInUnits : sizeInUnits.toFixed(2)
  } ${units[unitIndex]}`;
}

function calculateTrendMessage(prSize: number | undefined, targetSize: number | undefined): string {
  if (prSize === undefined || targetSize === undefined) {
    return '';
  }
  if (prSize === targetSize) {
    return '(➖)';
  }
  const diff = prSize - targetSize;
  const percent = ((diff / targetSize) * 100).toFixed(1);
  if (diff > 0) {
    return `($\${\\color{red}+${percent}\\\\%}$$)`;
  }
  return `($\${\\color{green}${percent}\\\\%}$$)`;
}
