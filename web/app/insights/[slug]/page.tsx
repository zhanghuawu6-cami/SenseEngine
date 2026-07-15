import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = repository.getPublishedPostBySlug(slug);
  if (!post) return { title: "内容不存在" };
  return { title: post.title, description: post.excerpt };
}

export default async function InsightDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = repository.getPublishedPostBySlug(slug);
  if (!post) notFound();
  const related = repository
    .listPosts({ type: post.type === "job" ? "article" : post.type, status: "published" })
    .filter((item) => item.id !== post.id)
    .slice(0, 2);

  return (
    <main className="article-page">
      <header className="article-hero">
        <div className="shell article-hero__inner">
          <Link href="/insights" className="article-back"><ArrowLeft size={16} /> 返回洞察</Link>
          <span>{post.eyebrow}</span>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div><time>{post.publishedAt.replaceAll("-", ".")}</time><em>{post.type === "update" ? "EVIDENCE JOURNAL" : "SENSEORDER RESEARCH"}</em></div>
        </div>
      </header>
      <article className="article-body shell">
        <RichText value={post.body} />
        <aside><span>EDITORIAL PRINCIPLE</span><p>本文描述的是当前理解与产品方向，不构成医疗判断、性能承诺或行业标准声明。</p></aside>
      </article>
      {related.length > 0 && (
        <section className="related-reading section section--tint"><div className="shell"><div className="index-label"><span>READ NEXT</span><h2>继续阅读</h2></div><div className="update-list">{related.map((item) => <Link href={`/insights/${item.slug}`} key={item.id}><time>{item.eyebrow}</time><h3>{item.title}</h3><p>{item.excerpt}</p><ArrowRight size={18} /></Link>)}</div></div></section>
      )}
    </main>
  );
}
