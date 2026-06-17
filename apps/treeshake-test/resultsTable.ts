type TestName = string;
type BundlerName = string;
export type Result = {
  prNamespace?: number;
  prNamed?: number;
  targetNamespace?: number;
};
type Row = Record<BundlerName, Result>;

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

  addRow(testName: string, result: Row | undefined) {
    if (result !== undefined && this.#isInteresting(result)) {
      this.#results.set(testName, result);
    }
  }

  toString() {
    const sortedResults = [...this.#results.entries()]
      .map(([test, row]) => [test, row, this.#maxAbsoluteChange(row)] as const)
      .toSorted(([, , scoreA], [, , scoreB]) => scoreB - scoreA)
      .map(([test, row]) => [test, row] as const);

    return this.getTable(
      sortedResults,
      (result) =>
        `${prettifySize(result?.prNamespace)} ${calculateTrendMessage(result?.prNamespace, result?.prNamed)}`,
    );
  }

  getProblematicNamedImports() {
    const sortedResults = [...this.#results.entries()]
      .map(([test, row]) => [test, row, this.#maxAbsoluteNamedChange(row)] as const)
      .toSorted(([, , scoreA], [, , scoreB]) => scoreB - scoreA)
      .filter(([, , score]) => score > this.#threshold)
      .map(([test, row]) => [test, row] as const);

    return this.getTable(
      sortedResults,
      (result) => `${calculateTrendMessage(result?.prNamed, result?.prNamespace)}`,
    );
  }

  getTable(
    sortedRows: (readonly [string, Row])[],
    stringifyCell: (result: Result | undefined) => string,
  ) {
    if (this.#results.size === 0) {
      return emptyResultsString;
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

    for (const [test, row] of sortedRows) {
      output += `| ${test}`;

      for (const bundler of this.#bundlers) {
        output += ` | ${stringifyCell(row[bundler])}`;
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
    for (const { prNamespace, targetNamespace } of Object.values(row)) {
      if (prNamespace !== undefined && targetNamespace !== undefined && targetNamespace !== 0) {
        max = Math.max(max, Math.abs((prNamespace - targetNamespace) / targetNamespace));
      }
    }
    return max;
  }

  #maxAbsoluteNamedChange(row: Row): number {
    let max = 0;
    for (const { prNamespace, prNamed } of Object.values(row)) {
      if (prNamespace !== undefined && prNamed !== undefined && prNamed !== 0) {
        max = Math.max(max, Math.abs((prNamespace - prNamed) / prNamed));
      }
    }
    return max;
  }

  #isInteresting(row: Row) {
    for (const cell of Object.values(row)) {
      const { prNamespace, prNamed, targetNamespace } = cell;
      if (targetNamespace === undefined) {
        return true;
      }

      if (
        prNamespace !== undefined &&
        reachesThreshold(prNamespace, targetNamespace, this.#threshold)
      ) {
        return true;
      }

      if (
        prNamespace !== undefined &&
        prNamed !== undefined &&
        reachesThreshold(prNamespace, prNamed, this.#threshold)
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

function reachesThreshold(valueA: number, valueB: number, threshold: number) {
  return Math.max(valueA / valueB, valueB / valueA) >= 1 + threshold;
}
