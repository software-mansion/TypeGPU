// @ts-check

import { type } from 'arktype';
import { readPackageJSON } from 'pkg-types';

const PublishTag = type('"alpha" | "beta" | undefined');

const packageJSON = await readPackageJSON();
const chosenPublishTag = PublishTag.assert(process.env.npm_config_tag);

export function verifyPublishTag() {
  let tagVerified = false;
  for (const { unit: tag } of /** @type {{ unit: string }[]} */ (
    PublishTag.json
  )) {
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

  if (!tagVerified) {
    throw new Error(
      `Publishing under a mismatched tag "${chosenPublishTag}" for version ${packageJSON.version}.`,
    );
  }
}
