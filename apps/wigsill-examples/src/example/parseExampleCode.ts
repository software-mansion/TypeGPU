import { type Example, ExampleMetadata } from './types';

export function parseExampleCode(rawCode: string): Example {
  // extracting metadata from the first comment
  let metadata: ExampleMetadata = {
    title: '<Unnamed>',
  };

  try {
    const snippet = rawCode.substring(
      rawCode.indexOf('/*') + 2,
      rawCode.indexOf('*/'),
    );
    metadata = ExampleMetadata.parse(JSON.parse(snippet));
  } catch (err) {
    console.error(
      `Malformed example, expected metadata json at the beginning. Reason: ${err}`,
    );
  }

  return {
    metadata,
    code: rawCode.slice(rawCode.indexOf('*/') + 2),
  };
}
