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

export async function confirmStep(message: string) {
  const res = await p.confirm({ message });
  if (p.isCancel(res)) {
    cancelExit();
  }
  return res;
}
