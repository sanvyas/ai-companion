export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Please sign in again.') => new AppError(401, 'unauthorized', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (what = 'That') => new AppError(404, 'not_found', `${what} wasn’t found.`);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);
export const tooMany = (message: string, retryAfterSeconds: number) =>
  new AppError(429, 'rate_limited', message, { retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
