import Link from 'next/link';
import { SmartImage } from '@/components/shared/SmartImage';
import { fmt, type Messages } from '@/i18n';
import { localizePath, pick } from '@/i18n/locales';
import { formatDate } from '@/lib/utils/dates';
import type { Locale, PostSummary } from '@/types';

export function PostCard({ post, locale, messages: m, categoryName }: { post: PostSummary; locale: Locale; messages: Messages; categoryName?: string }) {
  const href = localizePath(locale, `/blog/${post.slug}`);
  const title = pick(post.title, locale);
  return (
    <li className="postcard">
      <div className="postcard__cover" aria-hidden="true">
        {post.coverImage && <SmartImage src={post.coverImage.url} alt="" fill sizes="(min-width: 62rem) 24rem, 90vw" />}
      </div>
      <div className="postcard__body">
        <div className="postcard__meta">
          {categoryName && <span>{categoryName}</span>}
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale, { dateStyle: 'medium' })}</time>}
          <span>{fmt(m.blog.readTime, { n: post.readingMinutes[locale] })}</span>
        </div>
        <h3><Link href={href}>{title}</Link></h3>
        <p>{pick(post.excerpt, locale)}</p>
      </div>
    </li>
  );
}
