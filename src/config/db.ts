import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  connected = true;
  logger.info(`MongoDB 연결 완료: ${env.mongodbUri}`);

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB 연결 오류: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB 연결이 끊어졌습니다.');
    connected = false;
  });
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
