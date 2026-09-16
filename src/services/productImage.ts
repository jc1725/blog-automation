import { logger } from '../utils/logger';

/**
 * 쿠팡 상품 페이지 URL에서 대표 이미지(og:image)를 추출한다.
 * 실패해도 예외를 던지지 않고 null을 반환한다 (이미지 삽입은 선택 기능이므로
 * 실패해도 원고 생성/발행 자체는 계속 진행되어야 한다).
 */
export async function fetchProductImage(productUrl: string): Promise<string | null> {
  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn(`상품 이미지 조회 실패 (HTTP ${res.status}): ${productUrl}`);
      return null;
    }

    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (!match) {
      logger.warn(`og:image를 찾을 수 없음: ${productUrl}`);
      return null;
    }

    return match[1];
  } catch (error) {
    logger.warn(`상품 이미지 조회 중 오류: ${(error as Error).message}`);
    return null;
  }
}

/** 이미지 URL을 본문에 삽입할 <img> HTML 태그로 변환 */
export function buildProductImageHtml(imageUrl: string, alt: string): string {
  return `<img src="${imageUrl}" alt="${alt.replace(/"/g, '')}" style="max-width:100%;height:auto;display:block;margin:0 auto 16px;" />`;
}
