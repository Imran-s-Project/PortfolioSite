import type { PostSummary, Project } from '@/types';

/** Projects that share a category with `project`, then the rest in order — never the project itself. */
export function relatedProjects(project: Project, all: Project[], n = 3): Project[] {
  const others = all.filter((p) => p.slug !== project.slug);
  const shared = (p: Project) => p.categories.filter((c) => project.categories.includes(c)).length;
  return others
    .map((p, i) => ({ p, i, s: shared(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}

/** Posts sharing tags (weighted) or the category with `post`; falls back to the newest posts. */
export function relatedPosts(post: PostSummary, all: PostSummary[], n = 3): PostSummary[] {
  const others = all.filter((p) => p.id !== post.id);
  const score = (p: PostSummary) => p.tagIds.filter((t) => post.tagIds.includes(t)).length * 2 + (post.categoryId && p.categoryId === post.categoryId ? 1 : 0);
  return others
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}
