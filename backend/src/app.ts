import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { attachRequestId, AppError, globalErrorHandler } from './middleware/errorHandler.js';
import { apiV1Router } from './routes/apiV1.js';

export function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // Strict CORS origin validation
  app.use(
    cors({
      origin: env.corsAllowedOriginsList,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Firebase-AppCheck',
        'X-Business-Id',
        'X-Request-Id',
      ],
    })
  );

  // Request correlation ID
  app.use(attachRequestId);

  // Strict JSON body parsing limit
  app.use(express.json({ limit: '1mb' }));

  // Mount v1 REST API routes
  app.use('/api/v1', apiV1Router);

  // 404 handler for unknown routes
  app.use((req, _res, next) => {
    next(
      new AppError(
        404,
        'ROUTE_NOT_FOUND',
        `Route ${req.method} ${req.originalUrl} does not exist on the FloTech API.`
      )
    );
  });

  // Centralized error handler
  app.use(globalErrorHandler);

  return app;
}
