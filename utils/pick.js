module.exports = (obj, allowed) =>
  Object.keys(obj || {})
    .filter((k) => allowed.includes(k))
    .reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {});