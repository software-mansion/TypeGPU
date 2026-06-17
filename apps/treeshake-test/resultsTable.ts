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
    if (result !== undefined) {
      this.#results.set(testName, result);
    }
  }

  getBundleSizeTable() {
    const sortedResults = [...this.#results.entries()]
      .map(
        ([test, row]) =>
          [
            test,
            row,
            maxAbsoluteForRow(row, (row) => calculateChange(row.prNamespace, row.targetNamespace)),
          ] as const,
      )
      .filter(([, , score]) => score !== undefined && Math.abs(score) > this.#threshold)
      .toSorted(([, , scoreA], [, , scoreB]) => scoreB - scoreA)
      .map(([test, row]) => [test, row] as const);

    return this.#getTable(
      sortedResults,
      (result) =>
        `${prettifySize(result?.prNamespace)} ${calculateTrendMessage(result?.prNamespace, result?.targetNamespace)}`,
    );
  }

  getTreeShakabilityTable() {
    const sortedResults = [...this.#results.entries()]
      .map(
        ([test, row]) =>
          [
            test,
            row,
            maxAbsoluteForRow(row, (row) => calculateChange(row.prNamed, row.prNamespace)),
          ] as const,
      )
      .filter(([, , score]) => score !== undefined && Math.abs(score) > this.#threshold)
      .toSorted(([, , scoreA], [, , scoreB]) => scoreB - scoreA)
      .map(([test, row]) => [test, row] as const);

    return this.#getTable(
      sortedResults,
      (result) =>
        `${prettifySize(result?.prNamed)} ${calculateTrendMessage(result?.prNamed, result?.prNamespace)}`,
    );
  }

  #getTable(
    sortedRows: (readonly [string, Row])[],
    stringifyCell: (result: Result | undefined) => string,
  ) {
    if (sortedRows.length === 0) {
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

    if (sortedRows.length > 50) {
      output = `
<details>
<summary><b>Click to reveal the results table (${sortedRows.length} entries).</b></summary>

${output}

</details>`;
    }

    return output;
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

/**
 * @example
 * calculateChange(100, 20); // 4 (+400%)
 * calculateChange(100, 200); // -0.5 (-50%)
 * calculateChange(100, undefined); // undefined
 */
function calculateChange(value: number | undefined, base: number | undefined) {
  if (value === undefined || !base) {
    return undefined;
  }
  return (value - base) / base;
}

function maxAbsoluteForRow(row: Row, mapFn: (result: Result) => number | undefined) {
  let max = 0;
  for (const result of Object.values(row)) {
    const score = mapFn(result);
    if (score !== undefined && Math.abs(score) > Math.abs(max)) {
      max = score;
    }
  }
  return max;
}
