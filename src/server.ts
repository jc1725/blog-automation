import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`서버 시작: http://localhost:${env.port} (env=${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} 수신, 서버를 종료합니다...`);
    server.close(() => {
      logger.info('서버가 정상적으로 종료되었습니다.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error(`서버 시작 실패: ${(error as Error).message}`);
  process.exit(1);
});
