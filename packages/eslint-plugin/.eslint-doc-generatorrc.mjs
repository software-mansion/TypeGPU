const config = {
  ignoreConfig: ['all'],
  configEmoji: [['recommended', '⭐']],
  postprocess: (content) => {
    return content.replaceAll('💼', '🚨').replaceAll('🚫', '💤');
  },
};

export default config;
