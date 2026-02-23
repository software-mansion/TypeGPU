import { isMatInstance, isVecInstance } from '../data/wgslTypes.ts';

export function safeStringify(item: unknown): string {
  const asString = String(item);
  if (asString !== '[object Object]') {
    return asString;
  }

  try {
    return JSON.stringify(item);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return '<invalid json>';
  }
}

export function niceStringify(item: unknown): string {
  if (isVecInstance(item) || isMatInstance(item)) {
    // oxlint-disable-next-line typescript/no-base-to-string it's fine
    return item.toString();
  }

  if (Array.isArray(item)) {
    return `[${item.map(niceStringify).join(', ')}]`;
  }

  if (item && typeof item === 'object') {
    return `{ ${
      Object.entries(item).map(([key, value]) =>
        `${key}: ${niceStringify(value)}`
      ).join(', ')
    } }`;
  }

  return String(item);
}
