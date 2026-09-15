import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `경로를 찾을 수 없습니다: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    if (!err.isOperational) logger.error(err.stack ?? err.message);
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
  logger.error(err instanceof Error ? err.stack ?? message : message);
  res.status(500).json({ success: false, error: message });
}

/** async 라우트 핸들러의 에러를 자동으로 next()에 전달하는 래퍼 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
