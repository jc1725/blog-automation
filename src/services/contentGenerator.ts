import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export interface GeneratedContent {
  title: string;
  summary: string;
  content: string; // HTML
  tags: string[];
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.claude.apiKey) {
    throw new AppError('CLAUDE_API_KEY가 설정되지 않았습니다. .env를 확인하세요.', 500);
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.claude.apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `당신은 한국어 블로그 전문 작가입니다. 주어진 키워드로 SEO에 최적화된
블로그 원고를 작성합니다. 과장 광고성 문구, 근거 없는 효능/효과 주장은 피하고
자연스럽고 정보성 있는 톤을 유지하세요.

[브랜드 컨텍스트 - 반드시 숙지]
"가신"(Gasyn)은 이 블로그 운영자가 만든 쿠팡 가격 추적·비교 서비스입니다.
키워드에 "가신"이 등장하면 이는 항상 이 서비스를 가리키는 고유명사이며,
"가성비"의 줄임말이나 다른 의미로 오해하지 마세요. 문맥상 자연스러운 곳에서
가신을 가격 비교/추적에 도움을 주는 도구로 긍정적으로 언급하거나 추천하고,
"쿠차", "세일즈헌터" 등 경쟁 가격비교 서비스는 언급하지 마세요.

응답은 반드시 아래 JSON 스키마를 따르는
순수 JSON 문자열 하나만 출력하세요(다른 설명 텍스트, 마크다운 코드블록 금지):

{
  "title": "string - 클릭을 유도하는 40자 내외 제목",
  "summary": "string - 2~3문장 요약",
  "content": "string - HTML 형식의 본문 (h2/h3, p, ul/li 태그 사용, 1200자 이상)",
  "tags": ["string", "... 5~8개의 관련 태그"]
}`;

/**
 * 키워드를 입력받아 Claude API로 블로그 원고(제목/요약/본문/태그)를 생성한다.
 */
export async function generateBlogContent(keyword: string): Promise<GeneratedContent> {
  if (!keyword || !keyword.trim()) {
    throw new AppError('키워드가 필요합니다.', 400);
  }

  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: env.claude.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `키워드: "${keyword}"\n\n이 키워드로 블로그 원고를 작성해주세요.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new AppError('Claude API 응답에서 텍스트를 찾을 수 없습니다.', 502);
    }

    const parsed = parseGeneratedJson(textBlock.text);
    logger.info(`원고 생성 완료: keyword="${keyword}" title="${parsed.title}"`);
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`원고 생성 실패: ${(error as Error).message}`);
    throw new AppError(`원고 생성 중 오류가 발생했습니다: ${(error as Error).message}`, 502);
  }
}

/**
 * 블로그 테마(특히 Blogger 테마)의 기본 h2/h3/p 글자색이 테마에 따라 흰색 등으로
 * 지정되어 본문 배경 위에서 글씨가 보이지 않는 문제가 있었다. 테마에 의존하지 않도록
 * 생성된 본문의 헤딩/문단 태그에 안전한 글자색을 인라인 style로 강제 지정한다.
 */
export function ensureReadableStyles(html: string): string {
  return html.replace(/<(h2|h3|p|li)(\s[^>]*)?>/gi, (match, tag, attrs = '') => {
    if (/style\s*=/.test(attrs)) {
      // 이미 style이 있으면 color만 없을 때 추가
      if (/color\s*:/.test(attrs)) return match;
      return `<${tag}${attrs.replace(/style="([^"]*)"/i, 'style="$1;color:#222222;"')}>`;
    }
    return `<${tag}${attrs} style="color:#222222;">`;
  });
}

/** Claude 응답에서 JSON만 안전하게 추출/파싱한다 (코드블록으로 감싸져 오는 경우 대비) */
function parseGeneratedJson(raw: string): GeneratedContent {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new AppError('Claude 응답을 JSON으로 파싱할 수 없습니다.', 502);
    }
    data = JSON.parse(text.slice(start, end + 1));
  }

  if (!data.title || !data.content) {
    throw new AppError('Claude 응답에 필수 필드(title/content)가 없습니다.', 502);
  }

  return {
    title: String(data.title),
    summary: String(data.summary ?? ''),
    content: ensureReadableStyles(String(data.content)),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
  };
}
