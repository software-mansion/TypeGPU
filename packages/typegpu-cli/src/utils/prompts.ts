import * as p from '@clack/prompts';

export function cancelExit(): never {
  p.cancel('Operation cancelled.');
  process.exit(0);
}

export function failAndExit(message: string, detail?: string): never {
  p.cancel(message);
  if (detail) console.error(detail);
  process.exit(1);
}

export async function confirmStep(message: string, initialValue?: boolean) {
  const confirmOptions = initialValue !== undefined ? { message, initialValue } : { message };
  const res = await p.confirm(confirmOptions);
  if (p.isCancel(res)) {
    cancelExit();
  }
  return res;
}

// 0-255 range
export function rgbText(text: string, r: number, g: number, b: number) {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
