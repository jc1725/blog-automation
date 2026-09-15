import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export interface BloggerPublishResult {
  url: string;
  postId: string;
}

function getOAuthClient() {
  if (!env.google.clientId || !env.google.clientSecret || !env.google.refreshToken) {
    throw new AppError('Google OAuth 설정(client id/secret/refresh token)이 필요합니다. .env를 확인하세요.', 500);
  }

  const oauth2Client = new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );
  oauth2Client.setCredentials({ refresh_token: env.google.refreshToken });
  return oauth2Client;
}

/**
 * Google Blogger API v3로 포스트를 생성하고 즉시 발행한다.
 * 사전 준비: Google Cloud Console에서 Blogger API 활성화 + OAuth 동의화면 구성 +
 * 최초 1회 authorization code 플로우로 refresh token 발급 필요.
 */
export async function postToBlogger(title: string, contentHtml: string, labels: string[] = []): Promise<BloggerPublishResult> {
  if (!env.google.bloggerBlogId) {
    throw new AppError('GOOGLE_BLOGGER_BLOG_ID가 설정되지 않았습니다.', 500);
  }

  try {
    const auth = getOAuthClient();
    const blogger = google.blogger({ version: 'v3', auth });

    const response = await blogger.posts.insert({
      blogId: env.google.bloggerBlogId,
      isDraft: false,
      requestBody: {
        title,
        content: contentHtml,
        labels,
      },
    });

    const post = response.data;
    if (!post.url || !post.id) {
      throw new AppError('Blogger API 응답에 url/id가 없습니다.', 502);
    }

    logger.info(`Blogger 발행 완료: ${post.url}`);
    return { url: post.url, postId: post.id };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`Blogger 발행 실패: ${(error as Error).message}`);
    throw new AppError(`Blogger 발행 중 오류가 발생했습니다: ${(error as Error).message}`, 502);
  }
}

/**
 * 최초 설정 시 사용: 이 URL을 브라우저로 열어 로그인/동의 후 받은 code를
 * exchangeCodeForRefreshToken()에 전달하면 GOOGLE_REFRESH_TOKEN을 얻을 수 있다.
 */
export function getAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/blogger'],
  });
}

export async function exchangeCodeForRefreshToken(code: string): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new AppError('refresh_token을 받지 못했습니다. prompt=consent로 다시 시도하세요.', 502);
  }
  return tokens.refresh_token;
}
