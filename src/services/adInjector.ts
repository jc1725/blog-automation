import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { AdInsertion } from '../models/BlogPost';

export type AdPosition = AdInsertion['position'];

/**
 * AdSense 자동 삽입 코드, 또는 사용자가 직접 넘긴 광고 코드를
 * 본문 HTML의 지정 위치(top/middle/bottom)에 삽입한다.
 */
export function buildAdCode(customCode?: string): string {
  if (customCode && customCode.trim()) return customCode.trim();

  if (!env.ads.clientId || !env.ads.slotId) {
    throw new AppError('광고 코드가 없고 ADSENSE_CLIENT_ID/ADSENSE_SLOT_ID도 설정되지 않았습니다.', 400);
  }

  return [
    '<ins class="adsbygoogle"',
    ' style="display:block"',
    ` data-ad-client="${env.ads.clientId}"`,
    ` data-ad-slot="${env.ads.slotId}"`,
    ' data-ad-format="auto"',
    ' data-full-width-responsive="true"></ins>',
    '<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>',
  ].join('');
}

export function insertAdIntoContent(contentHtml: string, adCode: string, position: AdPosition): string {
  switch (position) {
    case 'top':
      return `${adCode}\n${contentHtml}`;
    case 'bottom':
      return `${contentHtml}\n${adCode}`;
    case 'middle': {
      const paragraphs = contentHtml.split(/(<\/p>)/i);
      // </p> 로 분리했으므로 짝수 인덱스가 텍스트, 홀수 인덱스가 구분자
      const midPoint = Math.floor(paragraphs.length / 2 / 2) * 2;
      if (midPoint <= 0 || midPoint >= paragraphs.length) {
        return `${contentHtml}\n${adCode}`;
      }
      paragraphs.splice(midPoint, 0, adCode);
      return paragraphs.join('');
    }
    default:
      return `${contentHtml}\n${adCode}`;
  }
}
