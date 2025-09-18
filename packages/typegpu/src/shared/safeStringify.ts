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
