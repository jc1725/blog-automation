import { Schema, model, Document, Types } from 'mongoose';

/** 개별 플랫폼(네이버/블로거) 발행 결과 */
export interface PublishResult {
  published: boolean;
  url?: string;
  publishedAt?: Date;
  error?: string;
}

export type PostStatus = 'draft' | 'generating' | 'ready' | 'publishing' | 'published' | 'failed';

export interface AdInsertion {
  code: string;
  insertedAt: Date;
  position: 'top' | 'middle' | 'bottom';
}

export interface BlogPostDocument extends Document {
  _id: Types.ObjectId;
  keyword: string;
  title: string;
  summary: string;
  content: string;
  status: PostStatus;
  naver: PublishResult;
  blogger: PublishResult;
  ads: AdInsertion[];
  tags: string[];
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PublishResultSchema = new Schema<PublishResult>(
  {
    published: { type: Boolean, default: false },
    url: { type: String },
    publishedAt: { type: Date },
    error: { type: String },
  },
  { _id: false }
);

const AdInsertionSchema = new Schema<AdInsertion>(
  {
    code: { type: String, required: true },
    insertedAt: { type: Date, default: () => new Date() },
    position: { type: String, enum: ['top', 'middle', 'bottom'], default: 'bottom' },
  },
  { _id: false }
);

const BlogPostSchema = new Schema<BlogPostDocument>(
  {
    keyword: { type: String, required: true, trim: true, index: true },
    // title/content는 문서 생성 직후(status: generating)엔 비어있다가 Claude API 응답으로 채워진다.
    // Mongoose는 required:true인 String에서 빈 문자열을 "값 없음"으로 취급해 저장이 막히므로 required는 걸지 않는다.
    title: { type: String, default: '' },
    summary: { type: String, default: '' },
    content: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'generating', 'ready', 'publishing', 'published', 'failed'],
      default: 'draft',
      index: true,
    },
    naver: { type: PublishResultSchema, default: () => ({ published: false }) },
    blogger: { type: PublishResultSchema, default: () => ({ published: false }) },
    ads: { type: [AdInsertionSchema], default: [] },
    tags: { type: [String], default: [] },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

BlogPostSchema.index({ createdAt: -1 });

export const BlogPost = model<BlogPostDocument>('BlogPost', BlogPostSchema);
