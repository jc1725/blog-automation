# Blog Automation

키워드 하나로 원고 생성(Claude API) → 네이버 블로그/구글 Blogger 동시 발행(Selenium + Blogger API) →
광고 코드 삽입까지 자동으로 처리하는 백엔드 서비스입니다.

## 기술 스택

- Node.js 20 + TypeScript + Express 4
- MongoDB (Mongoose)
- Claude API (`@anthropic-ai/sdk`) — 원고 생성
- Selenium WebDriver + Chromium — 네이버 블로그 자동 포스팅
- Google Blogger API v3 (`googleapis`) — 구글 Blogger 발행
- Docker / Docker Compose

## 폴더 구조

```
src/
├── server.ts               # 진입점
├── app.ts                  # Express 앱 구성 (미들웨어, 라우터)
├── config/
│   ├── env.ts               # 환경변수 로드/검증
│   └── db.ts                 # MongoDB 연결
├── models/
│   └── BlogPost.ts           # 포스트 스키마 (상태, 발행 결과, 광고 내역)
├── services/
│   ├── contentGenerator.ts   # Claude API로 원고 생성
│   ├── naverBlogPoster.ts    # Selenium 네이버 블로그 자동 포스팅
│   ├── bloggerPoster.ts      # Google Blogger API 발행
│   └── adInjector.ts         # 광고 코드 생성/본문 삽입
├── routes/
│   ├── posts.ts               # /api/posts 엔드포인트
│   └── health.ts              # /health 헬스체크
├── middleware/
│   └── errorHandler.ts        # 공통 에러 핸들러
└── utils/
    ├── logger.ts               # winston 로거
    └── AppError.ts             # 운영 에러 클래스
```

## API 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/api/posts/create` | `{ keyword }` → Claude API로 원고 생성 |
| GET | `/api/posts` | 목록 조회 (`?status=&limit=`) |
| GET | `/api/posts/:id` | 상세 조회 |
| POST | `/api/posts/:id/publish` | `{ target: "naver" \| "blogger" \| "both" }` → 발행 |
| POST | `/api/posts/:id/add-ads` | `{ code?, position: "top"\|"middle"\|"bottom" }` → 광고 삽입 |
| GET | `/health` | 헬스 체크 (DB 연결 상태 포함) |

### 예시

```bash
# 1. 원고 생성
curl -X POST http://localhost:3000/api/posts/create \
  -H "Content-Type: application/json" \
  -d '{"keyword": "쿠팡 겨울 추천상품"}'

# 2. 발행 (네이버+블로거 동시)
curl -X POST http://localhost:3000/api/posts/<id>/publish \
  -H "Content-Type: application/json" \
  -d '{"target": "both"}'

# 3. 광고 삽입
curl -X POST http://localhost:3000/api/posts/<id>/add-ads \
  -H "Content-Type: application/json" \
  -d '{"position": "bottom"}'
```

## 로컬 실행

```bash
npm install
cp .env.example .env   # 값 채우기
npm run dev             # ts-node + nodemon
```

MongoDB가 로컬에 없다면:

```bash
docker run -d --name mongo -p 27017:27017 mongo:7
```

## Docker로 실행

```bash
cp .env.example .env   # 값 채우기 (MONGODB_URI는 compose가 덮어씀)
docker compose up --build
```

앱: http://localhost:3000, 헬스체크: http://localhost:3000/health

## 환경변수

`.env.example` 참고. 필수 그룹:

- **Claude API**: `CLAUDE_API_KEY`, `CLAUDE_MODEL`
- **네이버**: `NAVER_ID`, `NAVER_PASSWORD`, `NAVER_BLOG_URL` (2단계 인증 켜져 있으면 실패할 수 있음 — 자동화 전용 계정 권장)
- **Google Blogger**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_BLOGGER_BLOG_ID`
  - `GOOGLE_CLIENT_ID`/`SECRET`은 Google Cloud Console에서 발급 (아래 "Google 인증 정보 발급" 참고)
  - `GOOGLE_REFRESH_TOKEN`과 실제 `GOOGLE_BLOGGER_BLOG_ID`는 `npm run google:token`으로 한 번에 발급

### Google 인증 정보 발급

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트 생성 (또는 기존 프로젝트 선택)
2. **APIs & Services → Library**에서 "Blogger API v3" 검색 후 Enable
3. **APIs & Services → OAuth consent screen**에서 External(또는 Internal) 선택, 앱 이름/이메일만 채우고 저장 (테스트 단계에서는 "테스트 사용자"에 본인 구글 계정 추가)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs에 `.env`의 `GOOGLE_REDIRECT_URI`와 **정확히 동일한 값** 추가 (기본값: `http://localhost:3000/oauth2callback`)
   - 생성되면 나오는 **Client ID**, **Client secret**을 `.env`에 복사
5. `.env`에 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`까지만 채운 뒤:
   ```bash
   npm run google:token
   ```
   출력되는 URL을 브라우저로 열어 로그인/동의하면, 터미널에 `GOOGLE_REFRESH_TOKEN`과
   내 블로그 목록(+ 실제 숫자 `blogId`)이 함께 출력됩니다. 그 값을 그대로 `.env`에 붙여넣으면 됩니다.
   (`GOOGLE_BLOGGER_BLOG_ID`는 blogspot 주소나 이름이 아니라 이 숫자 id를 사용해야 합니다.)
- **광고**: `ADSENSE_CLIENT_ID`, `ADSENSE_SLOT_ID` (또는 `/add-ads` 호출 시 `code`를 직접 전달)

## 알아둘 점

- 네이버 스마트에디터는 DOM 구조가 수시로 바뀝니다. `naverBlogPoster.ts`의 CSS 셀렉터가 깨지면
  `SELENIUM_HEADLESS=false`로 두고 직접 화면을 보면서 셀렉터를 갱신하세요.
- 네이버 로그인은 2단계 인증/캡차가 뜨면 자동화가 막힙니다. 자동 포스팅 전용 계정에서
  "새 기기 등록" 절차를 미리 완료해두는 것을 권장합니다.
- Claude API 응답은 순수 JSON 문자열을 기대합니다. 모델이 다른 형식으로 응답하면
  `contentGenerator.ts`의 `parseGeneratedJson`이 코드블록/잡음을 제거하고 파싱을 시도합니다.

## 다음 단계 (선택)

1. `node-cron`으로 정해진 시간에 `/create` → `/publish` 자동 실행
2. 관리용 대시보드 UI 추가
3. 다중 사용자/계정 지원
4. 티스토리 등 다른 플랫폼 확장
