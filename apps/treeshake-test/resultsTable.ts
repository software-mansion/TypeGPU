type TestName = string;
type BundlerName = string;
type Result = { direct?: number; endpoint?: number };
type TestResults = Record<BundlerName, Result>;
type Row = Map<BundlerName, { pr: Result; target: Result }>;

export const emptyResultsString = '*No major changes.*';

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
        pr: prResults?.[bundlerName] ?? {},
        target: targetResults?.[bundlerName] ?? {},
      });
    }

    if (this.#isInteresting(row)) {
      this.#results.set(testName, row);
    }
  }

  toString() {
    if (this.#results.size === 0) {
      return emptyResultsString;
    }

    let output = '';
    output += '| Test';
    for (const bundler of this.#bundlers) {
      output += ` | ${bundler} (direct)`;
      output += ` | ${bundler} (endpoint)`;
    }
    output += ' |\n';

    output += '|---------';
    for (const _ of this.#bundlers) {
      output += '|---------';
      output += '|---------';
    }
    output += ' |\n';

    const sortedResults = [...this.#results.entries()]
      .map(([test, row]) => [test, row, this.#maxAbsoluteChange(row)] as const)
      .toSorted(([, , scoreA], [, , scoreB]) => scoreB - scoreA)
      .map(([test, row]) => [test, row] as const);

    for (const [test, row] of sortedResults) {
      output += `| ${test.replaceAll('_', ' ')}`;

      for (const bundler of this.#bundlers) {
        const prSize = row.get(bundler)?.pr;
        const targetSize = row.get(bundler)?.target;

        output += ` | ${prettifySize(prSize?.direct)} ${calculateTrendMessage(prSize?.direct, targetSize?.direct)}`;
        output += ` | ${prettifySize(prSize?.endpoint)} ${calculateTrendMessage(prSize?.endpoint, targetSize?.endpoint)}`;
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

  #maxAbsoluteChange(row: Row): number {
    let max = 0;
    for (const { pr, target } of row.values()) {
      if (pr.direct !== undefined && target.direct !== undefined && target.direct !== 0) {
        max = Math.max(max, Math.abs((pr.direct - target.direct) / target.direct));
      }
      if (pr.endpoint !== undefined && target.endpoint !== undefined && target.endpoint !== 0) {
        max = Math.max(max, Math.abs((pr.endpoint - target.endpoint) / target.endpoint));
      }
    }
    return max;
  }

  #isInteresting(row: Row) {
    for (const cell of row) {
      const pr = cell[1].pr;
      const target = cell[1].target;
      if (
        (pr.direct && target.direct === undefined) ||
        (pr.endpoint && target.endpoint === undefined)
      ) {
        return true;
      }
      if (
        pr.direct &&
        target.direct &&
        Math.max(pr.direct / target.direct, target.direct / pr.direct) >= 1 + this.#threshold
      ) {
        return true;
      }
      if (
        pr.endpoint &&
        target.endpoint &&
        Math.max(pr.endpoint / target.endpoint, target.endpoint / pr.endpoint) >=
          1 + this.#threshold
      ) {
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
