export type CallExpression = {
  /** identifier key */
  call: string;
  /** expressions passed as function arguments */
  args: Wgsl[];
};

export type Identifier = {
  /** identifier key */
  id: string;
};

export type Block = {
  /** code that is part of this block */
  block: Wgsl;
};

export type Wgsl =
  | string
  | number
  | boolean
  | CallExpression
  | Identifier
  | Wgsl[];
