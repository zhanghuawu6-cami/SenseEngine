import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { InsightCard } from "@/components/InsightCard";
import { SubpageHero } from "@/components/SubpageHero";
import { repository } from "@/lib/repository";

export const metadata: Metadata = {
  title: "洞察",
  description: "序感科技关于 State Computing、长期记忆、可信治理和产品验证的公开思考与进展。",
};

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const articles = repository.listPosts({ type: "article", status: "published" });
  const updates = repository.listPosts({ type: "update", status: "published" });
  return (
    <main>
      <SubpageHero
        eyebrow="INSIGHTS / EVIDENCE JOURNAL"
        title={<>公开我们如何思考，<br />也公开我们仍不知道什么。</>}
        description="关于状态计算、长期记忆、可信治理和产品验证的持续记录。每一个结论都应该能被新的证据改写。"
        meta={["观点", "工程", "研究", "进展"]}
      />
      <section className="insights-index section">
        <div className="shell">
          <div className="index-label"><span>01</span><h2>观点与工程</h2><p>THINKING & ENGINEERING</p></div>
          <div className="insight-grid">{articles.map((post) => <InsightCard post={post} key={post.id} />)}</div>
        </div>
      </section>
      <section className="updates-index section section--tint">
        <div className="shell">
          <div className="index-label"><span>02</span><h2>公司进展</h2><p>EVIDENCE JOURNAL</p></div>
          <div className="update-list">
            {updates.map((post) => (
              <Link href={`/insights/${post.slug}`} key={post.id}>
                <time>{post.publishedAt.replaceAll("-", ".")}</time><h3>{post.title}</h3><p>{post.excerpt}</p><ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
