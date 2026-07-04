import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Global error handler — catches validation errors, known errors, and unexpected crashes.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Known application errors
  if ('statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number') {
    const statusCode = (err as { statusCode: number }).statusCode;
    res.status(statusCode).json({ error: err.message });
    return;
  }

  // Unexpected errors
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
