// Multer removed — file uploads handled via Hono's parseBody({ all: true })
// This module is kept as a no-op to avoid breaking any remaining references.
module.exports = {
  single: () => (c, next) => next(),
  fields: () => (c, next) => next(),
  array: () => (c, next) => next(),
  none: () => (c, next) => next(),
  any: () => (c, next) => next(),
};
