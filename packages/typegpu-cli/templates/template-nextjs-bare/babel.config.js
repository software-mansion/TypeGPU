module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['next/babel'],
    plugins: ['unplugin-typegpu/babel'],
  };
};
