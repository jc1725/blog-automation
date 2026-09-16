import { google } from 'googleapis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { ensureReadableStyles } from './contentGenerator';

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
 * 이미 발행된 포스트를 URL로 찾아 본문 HTML을 통째로 교체(업데이트)한다.
 * 테마 CSS 문제 등으로 발행 후 본문을 고쳐야 할 때 사용.
 */
export async function updateBloggerPostContent(url: string, contentHtml: string): Promise<BloggerPublishResult> {
  if (!env.google.bloggerBlogId) {
    throw new AppError('GOOGLE_BLOGGER_BLOG_ID가 설정되지 않았습니다.', 500);
  }
  const path = new URL(url).pathname;
  const auth = getOAuthClient();
  const blogger = google.blogger({ version: 'v3', auth });

  const got = await blogger.posts.getByPath({ blogId: env.google.bloggerBlogId, path });
  const existing = got.data;
  if (!existing.id) throw new AppError('해당 URL의 Blogger 포스트를 찾을 수 없습니다.', 404);

  const updated = await blogger.posts.update({
    blogId: env.google.bloggerBlogId,
    postId: existing.id,
    requestBody: { title: existing.title, content: contentHtml },
  });

  if (!updated.data.url || !updated.data.id) {
    throw new AppError('Blogger 업데이트 응답에 url/id가 없습니다.', 502);
  }
  return { url: updated.data.url, postId: updated.data.id };
}

/**
 * 이미 발행된 포스트를 URL로 찾아, 현재 본문에 안전한 글자색 인라인 스타일을
 * 보정해서 다시 저장한다 (테마의 기본 글자색이 흰색 등이라 본문이 안 보이는 문제 대응).
 */
export async function fixBloggerPostStyles(url: string): Promise<BloggerPublishResult> {
  if (!env.google.bloggerBlogId) {
    throw new AppError('GOOGLE_BLOGGER_BLOG_ID가 설정되지 않았습니다.', 500);
  }
  const path = new URL(url).pathname;
  const auth = getOAuthClient();
  const blogger = google.blogger({ version: 'v3', auth });

  const got = await blogger.posts.getByPath({ blogId: env.google.bloggerBlogId, path });
  const existing = got.data;
  if (!existing.id) throw new AppError('해당 URL의 Blogger 포스트를 찾을 수 없습니다.', 404);

  const fixed = ensureReadableStyles(existing.content || '');
  return updateBloggerPostContent(url, fixed);
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
