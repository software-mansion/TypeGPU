// @ts-check

import { type } from 'arktype';
import { readPackageJSON } from 'pkg-types';

const PublishTags = /** @type {const} */ (['alpha', 'beta']);

const PublishTag = type.or(
  'undefined',
  ...PublishTags.map((tag) => /** @type {const} */ (`"${tag}"`)),
);

const packageJSON = await readPackageJSON();
const chosenPublishTag = PublishTag.assert(process.env.npm_config_tag);

export function verifyPublishTag() {
  let tagVerified = false;
  for (const tag of PublishTags) {
    if (packageJSON.version?.includes(tag)) {
      if (tag !== chosenPublishTag) {
        throw new Error(
          `Publishing under a mismatched tag "${chosenPublishTag}" for version ${packageJSON.version}. Use --tag ${tag}`,
        );
      }

      tagVerified = true;
      break;
    }
  }

  if (!tagVerified && chosenPublishTag !== undefined) {
    throw new Error(
      `Publishing under a mismatched tag "${chosenPublishTag}" for version ${packageJSON.version}.`,
    );
  }
}
