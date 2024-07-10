const rawExamples: Record<string, string> = import.meta.glob(
  '../examples/**/*.js',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

import { mapValues } from 'remeda';
import { ExampleMetadata } from './types';

export const examples = mapValues(rawExamples, (code) => {
  // extracting metadata from the first comment
  let metadata: ExampleMetadata = {
    title: '<Unnamed>',
  };

  try {
    const snippet = code.substring(code.indexOf('/*') + 2, code.indexOf('*/'));
    metadata = ExampleMetadata.parse(JSON.parse(snippet));
  } catch (err) {
    console.error(
      `Malformed example, expected metadata json at the beginning. Reason: ${err}`,
    );
  }

  // Turning `import Default, { one, two } from ''module` statements into `const { default: Default, one, two } = await _import('')`

  return {
    metadata,
    code: code.substring(code.indexOf('*/') + 2),
  };
});
