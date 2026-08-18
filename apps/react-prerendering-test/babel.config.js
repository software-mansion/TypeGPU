module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['next/babel'],
    plugins: ['./node_modules/unplugin-typegpu/dist/babel.js'], // cannot parse .ts file
  };
};
