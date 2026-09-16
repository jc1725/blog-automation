import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // 개발 편의를 위해 기동 시점에는 경고만 남기고, 실제 사용 시점(서비스 호출)에 에러를 던진다.
    return '';
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongodbUri: required('MONGODB_URI', 'mongodb://localhost:27017/blog-automation'),

  claude: {
    apiKey: required('CLAUDE_API_KEY'),
    model: required('CLAUDE_MODEL', 'claude-opus-4-6'),
  },

  naver: {
    id: required('NAVER_ID'),
    password: required('NAVER_PASSWORD'),
    blogUrl: required('NAVER_BLOG_URL'),
    chromeBin: process.env.CHROME_BIN,
    headless: (process.env.SELENIUM_HEADLESS ?? 'true') !== 'false',
  },

  google: {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: required('GOOGLE_REDIRECT_URI', 'http://localhost:3000/oauth2callback'),
    refreshToken: required('GOOGLE_REFRESH_TOKEN'),
    bloggerBlogId: required('GOOGLE_BLOGGER_BLOG_ID'),
  },

  ads: {
    clientId: process.env.ADSENSE_CLIENT_ID ?? '',
    slotId: process.env.ADSENSE_SLOT_ID ?? '',
    // 모든 신규 포스트 상단에 자동으로 삽입되는 기본 배너(쿠팡 파트너스 등). 비워두면 자동 삽입 안 함.
    defaultTopBannerHtml:
      process.env.DEFAULT_TOP_BANNER_HTML ??
      '<iframe src="https://coupa.ng/cpv5uY" width="100%" height="75" frameborder="0" scrolling="no" referrerpolicy="unsafe-url"></iframe>',
  },

  // 콘텐츠 내 "가신" 언급을 클릭 가능한 링크로 연결할 URL
  gasynLinkUrl: process.env.GASYN_LINK_URL ?? 'https://gasin.shop',
};
