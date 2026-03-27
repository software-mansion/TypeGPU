/** @type {import('eslint-doc-generator').GenerateOptions} */
export const config = {
  pathRuleDoc(name) {
    const [plugin, rule] = name.split('/');
    return `packages/eslint-plugin-${plugin}/docs/rules/${rule}.md`;
  },
};
