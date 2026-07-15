import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ContentPost } from "@/lib/types";

export function InsightCard({ post }: { post: ContentPost }) {
  return (
    <Link href={`/insights/${post.slug}`} className="insight-card">
      <div className="insight-card__top">
        <span>{post.eyebrow}</span>
        <ArrowUpRight size={18} strokeWidth={1.5} />
      </div>
      <h3>{post.title}</h3>
      <p>{post.excerpt}</p>
      <time>{post.publishedAt.replaceAll("-", ".")}</time>
    </Link>
  );
}
