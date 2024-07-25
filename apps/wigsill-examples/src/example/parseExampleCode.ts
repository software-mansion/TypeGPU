import { type Example, ExampleMetadata, exampleCategories } from './types';

export function parseExampleCode(key: string, rawCode: string): Example | null {
  // extracting metadata from the first comment
  let metadata: ExampleMetadata = {
    title: '<Unnamed>',
    category: '<No category>',
  };

  try {
    const snippet = rawCode.substring(
      rawCode.indexOf('/*') + 2,
      rawCode.indexOf('*/'),
    );
    metadata = ExampleMetadata.parse(JSON.parse(snippet));
  } catch (err) {
    // Not an example, bail
    return null;
  }

  if (
    !exampleCategories.find((category) => category.key === metadata.category)
  ) {
    console.warn(
      `Example '${metadata.title}' used unknown category: ${metadata.category}.`,
    );
    return null;
  }

  return {
    key,
    metadata,
    code: rawCode.slice(rawCode.indexOf('*/') + 2),
  };
}
