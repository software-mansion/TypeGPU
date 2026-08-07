//@ts-check
const binding = require('./binding');

/**
 * Throw a reflink error.
 * @param {binding.ReflinkError} reflinkError Error properties.
 * @returns {Error & binding.ReflinkError}
 */
function createReflinkError(reflinkError) {
  const error = new Error(reflinkError.message)
  return Object.assign(error, {
    path: reflinkError.path,
    dest: reflinkError.dest,
    code: reflinkError.code,
    errno: reflinkError.errno,
  });
}

/**
 * Either throw the reflink error or return the number.
 * @param {number | binding.ReflinkError} result Result of the binding function.
 * @returns {number}
 */
function handleReflinkResult(result) {
  if (typeof result === 'number') {
    return result;
  } else {
    throw createReflinkError(result);
  }
}

/**
 * Create a reflink asynchronously.
 * @param {String} src Source of the reflink.
 * @param {String} dst Target of the reflink.
 * @returns {Promise.<number>}
 */
const reflinkFile = (src, dst) => binding.reflinkFile(src, dst).then(handleReflinkResult);

/**
 * Create a reflink asynchronously.
 * @param {String} src Source of the reflink.
 * @param {String} dst Target of the reflink.
 * @returns {number}
 */
const reflinkFileSync = (src, dst) => handleReflinkResult(binding.reflinkFileSync(src, dst));

module.exports = {
  reflinkFile,
  reflinkFileSync,
};
