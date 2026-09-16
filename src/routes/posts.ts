import { Router } from 'express';
import { z } from 'zod';
import { BlogPost } from '../models/BlogPost';
import { generateBlogContent } from '../services/contentGenerator';
import { postToNaverBlog } from '../services/naverBlogPoster';
import { postToBlogger, fixBloggerPostStyles } from '../services/bloggerPoster';
import { buildAdCode, insertAdIntoContent, AdPosition } from '../services/adInjector';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const postsRouter = Router();

const createSchema = z.object({ keyword: z.string().min(1, '키워드는 필수입니다.') });
const publishSchema = z.object({
  target: z.enum(['naver', 'blogger', 'both']).default('both'),
});
const fixStylesSchema = z.object({
  url: z.string().url('올바른 URL이 아닙니다.'),
});

const adsSchema = z.object({
  code: z.string().optional(),
  position: z.enum(['top', 'middle', 'bottom']).default('bottom'),
});

/** POST /api/posts/create - 키워드로 원고 생성 */
postsRouter.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { keyword } = createSchema.parse(req.body);

    const post = await BlogPost.create({ keyword, status: 'generating' });

    try {
      const generated = await generateBlogContent(keyword);
      post.title = generated.title;
      post.summary = generated.summary;
      post.content = generated.content;
      post.tags = generated.tags;

      // 모든 신규 포스트 상단에 기본 배너(쿠팡 파트너스 등) 자동 삽입.
      // DEFAULT_TOP_BANNER_HTML을 빈 값으로 설정하면 자동 삽입을 끌 수 있다.
      if (env.ads.defaultTopBannerHtml) {
        post.content = insertAdIntoContent(post.content, env.ads.defaultTopBannerHtml, 'top');
        post.ads.push({ code: env.ads.defaultTopBannerHtml, insertedAt: new Date(), position: 'top' });
      }

      post.status = 'ready';
      await post.save();
    } catch (error) {
      post.status = 'failed';
      post.errorMessage = (error as Error).message;
      await post.save();
      throw error;
    }

    res.status(201).json({ success: true, data: post });
  })
);

/** GET /api/posts - 목록 조회 (?status=&limit=) */
postsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);

    const filter = status ? { status } : {};
    const posts = await BlogPost.find(filter).sort({ createdAt: -1 }).limit(limit);

    res.json({ success: true, count: posts.length, data: posts });
  })
);

/** GET /api/posts/:id - 상세 조회 */
postsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const post = await BlogPost.findById(req.params.id);
    if (!post) throw new AppError('포스트를 찾을 수 없습니다.', 404);
    res.json({ success: true, data: post });
  })
);

/** POST /api/posts/:id/publish - 네이버/블로거 발행 */
postsRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const { target } = publishSchema.parse(req.body ?? {});
    const post = await BlogPost.findById(req.params.id);
    if (!post) throw new AppError('포스트를 찾을 수 없습니다.', 404);
    if (!post.content) throw new AppError('원고가 없는 포스트입니다. 먼저 /create로 생성하세요.', 400);

    post.status = 'publishing';
    await post.save();

    const results: { naver?: string; blogger?: string } = {};
    const errors: string[] = [];

    if (target === 'naver' || target === 'both') {
      try {
        const r = await postToNaverBlog(post.title, post.content);
        post.naver = { published: true, url: r.url, publishedAt: new Date() };
        results.naver = r.url;
      } catch (error) {
        post.naver = { published: false, error: (error as Error).message };
        errors.push(`naver: ${(error as Error).message}`);
        logger.error(`네이버 발행 실패 (postId=${post.id}): ${(error as Error).message}`);
      }
    }

    if (target === 'blogger' || target === 'both') {
      try {
        const r = await postToBlogger(post.title, post.content, post.tags);
        post.blogger = { published: true, url: r.url, publishedAt: new Date() };
        results.blogger = r.url;
      } catch (error) {
        post.blogger = { published: false, error: (error as Error).message };
        errors.push(`blogger: ${(error as Error).message}`);
        logger.error(`Blogger 발행 실패 (postId=${post.id}): ${(error as Error).message}`);
      }
    }

    post.status = errors.length === 0 ? 'published' : post.naver.published || post.blogger.published ? 'published' : 'failed';
    post.errorMessage = errors.length ? errors.join(' / ') : undefined;
    await post.save();

    res.json({ success: errors.length === 0, data: post, results, errors });
  })
);

/** POST /api/posts/fix-blogger-styles - 이미 발행된 Blogger 글의 글자색(테마 문제)을 보정 */
postsRouter.post(
  '/fix-blogger-styles',
  asyncHandler(async (req, res) => {
    const { url } = fixStylesSchema.parse(req.body ?? {});
    const result = await fixBloggerPostStyles(url);
    res.json({ success: true, data: result });
  })
);

/** POST /api/posts/:id/add-ads - 광고 코드 삽입 */
postsRouter.post(
  '/:id/add-ads',
  asyncHandler(async (req, res) => {
    const { code, position } = adsSchema.parse(req.body ?? {});
    const post = await BlogPost.findById(req.params.id);
    if (!post) throw new AppError('포스트를 찾을 수 없습니다.', 404);
    if (!post.content) throw new AppError('원고가 없는 포스트입니다.', 400);

    const adCode = buildAdCode(code);
    post.content = insertAdIntoContent(post.content, adCode, position as AdPosition);
    post.ads.push({ code: adCode, insertedAt: new Date(), position: position as AdPosition });
    await post.save();

    res.json({ success: true, data: post });
  })
);
