/**
 * GOOGLE_REFRESH_TOKEN 발급용 1회성 스크립트.
 *
 * 사용법:
 *   1) .env에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 까지만 채운다.
 *   2) npm run google:token
 *   3) 터미널에 출력되는 URL을 브라우저에서 열고 구글 로그인 + 동의
 *   4) 리다이렉트되면 터미널에 refresh token과 "내 블로그 목록 + 실제 blogId"가 함께 출력됨
 *   5) 출력된 값을 .env의 GOOGLE_REFRESH_TOKEN / GOOGLE_BLOGGER_BLOG_ID에 복사
 *
 * 주의: Google Cloud Console의 OAuth 클라이언트 "승인된 리디렉션 URI"에
 * GOOGLE_REDIRECT_URI와 정확히 같은 값(기본 http://localhost:3000/oauth2callback)이
 * 등록되어 있어야 한다.
 */
import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
const PORT = Number(new URL(REDIRECT_URI).port || 3000);
const REDIRECT_PATH = new URL(REDIRECT_URI).pathname || '/oauth2callback';

async function main(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('\n❌ .env에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET을 먼저 채워주세요.\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/blogger'],
  });

  console.log('\n1) 아래 URL을 브라우저에서 열어 구글 로그인 후 동의하세요:\n');
  console.log(authUrl);
  console.log(`\n2) 로그인 후 ${REDIRECT_URI} 로 리다이렉트되면 자동으로 처리됩니다. 대기 중...\n`);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, oauth2Client, server);
  });

  server.listen(PORT, () => {
    console.log(`대기 서버 실행 중: http://localhost:${PORT}${REDIRECT_PATH}`);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  server: http.Server
): Promise<void> {
  if (!req.url) return;
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== REDIRECT_PATH) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');

  if (errorParam || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>인증이 취소되었거나 code가 없습니다. 터미널을 확인하세요.</h2>');
    console.error(`\n❌ 인증 실패: ${errorParam ?? 'code 없음'}\n`);
    server.close();
    process.exit(1);
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>인증 완료! 이 창은 닫고 터미널을 확인하세요.</h2>');

    if (!tokens.refresh_token) {
      console.log(
        '\n⚠️  refresh_token이 응답에 없습니다. 이미 한 번 동의한 계정이면 ' +
          'https://myaccount.google.com/permissions 에서 이 앱의 액세스를 제거한 뒤 다시 시도하세요.\n'
      );
    } else {
      console.log('\n✅ GOOGLE_REFRESH_TOKEN=\n');
      console.log(tokens.refresh_token);
    }

    const blogger = google.blogger({ version: 'v3', auth: oauth2Client });
    const list = await blogger.blogs.listByUser({ userId: 'self' });
    const blogs = list.data.items ?? [];

    console.log('\n📋 내 블로그 목록 (GOOGLE_BLOGGER_BLOG_ID로 사용할 실제 id):\n');
    if (blogs.length === 0) {
      console.log('  (연결된 Blogger 블로그가 없습니다. blogger.com에서 먼저 블로그를 생성하세요.)');
    } else {
      blogs.forEach((b) => console.log(`  - ${b.name}  (${b.url})  →  id: ${b.id}`));
    }
    console.log('');
  } catch (err) {
    console.error('\n❌ 토큰 교환 실패:', (err as Error).message, '\n');
    res.writeHead(500);
    res.end('토큰 교환 실패. 터미널 로그를 확인하세요.');
  } finally {
    server.close();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
