/**
 * Limit between two neighboring tangent normals beyond which
 * a miter is used for the join. This prevents tiny join triangles
 * at almost-straight segment pairs.
 */
export const MITER_DOT_PRODUCT_LIMIT = 0.99;
