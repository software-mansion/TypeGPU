import type { Implementation } from './fnTypes';

export function stripTemplate(
  arg: Implementation | TemplateStringsArray,
  ...values: unknown[]
): Implementation {
  if (isTemplateStringsArray(arg)) {
    return templateLiteralIdentity(arg, ...values);
  }
  return arg;
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return (
    Array.isArray(value) &&
    'raw' in value &&
    Array.isArray(value.raw) &&
    value.raw.every((item: unknown) => typeof item === 'string')
  );
}

function templateLiteralIdentity(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings
    .slice(1)
    .reduce(
      (acc, elem, index) => `${acc}${values[index]}${elem}`,
      strings[0] as string,
    );
}
