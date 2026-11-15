import { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/** Keep diagnostics and unauthenticated configuration edits local; research is deployable. */
export const requireLocalDevelopment: RequestHandler = (req, _res, next) => {
  if (env.NODE_ENV === 'production' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
    next(new AppError('This operation is available only in the local development workspace.', 403, 'LOCAL_OPERATION_ONLY'));
    return;
  }
  next();
};
