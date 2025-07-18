export const ErrorCode = {
  illegalBufferAccess: 0,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
