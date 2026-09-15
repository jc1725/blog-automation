import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let connected = false;

/** 로그에 비밀번호가 그대로 남지 않도록 연결 문자열의 인증 정보를 가린다. */
function maskConnectionString(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:/@]+):([^@]+)@/i, '$1$2:****@');
}

export async function connectDB(): Promise<void> {
  if (connected) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  connected = true;
  logger.info(`MongoDB 연결 완료: ${maskConnectionString(env.mongodbUri)}`);

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
