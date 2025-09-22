import { isMatInstance, isVecInstance } from '../data/wgslTypes';

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
  if (item) {
    if (Array.isArray(item) && !isVecInstance(item) && !isMatInstance(item)) {
      return `[${item.map(niceStringify).join(', ')}]`;
    }

    const asString = String(item);
    if (asString !== '[object Object]') {
      return asString;
    }

    if (typeof item === 'object') {
      return `{ ${
        Object.entries(item).map(([key, value]) =>
          `${key}: ${niceStringify(value)}`
        ).join(', ')
      } }`;
    }
  }

  console.error('Error stringifying item:', item);
  return '<invalid item>';
}
