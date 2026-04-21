import { isPtrType } from '#shaderbit';
import { isPtrImplicitType, type SnippetType } from './snippet.ts';

export function unptr(data: SnippetType): SnippetType {
  if (isPtrType(data) || isPtrImplicitType(data)) {
    return data.inner;
  }
  return data;
}
