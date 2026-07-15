import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { BreathingField } from "@/components/BreathingField";
import { InsightCard } from "@/components/InsightCard";
import { SectionHeading } from "@/components/SectionHeading";
import { StateField } from "@/components/StateField";
import { StateLoopDiagram } from "@/components/StateLoopDiagram";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

const productLayers = [
  { code: "01", name: "Sense State Lab", summary: "用真实反馈验证状态闭环的研究与早期用户应用。", status: "验证中", href: "/products#state-lab" },
  { code: "02", name: "State Runtime", summary: "连接信号、状态、记忆、策略与审计的端云运行时。", status: "核心构建", href: "/products#runtime" },
  { code: "03", name: "State SDK", summary: "面向 AI 终端厂商的接入、评测、回滚与治理工具。", status: "设计伙伴", href: "/products#sdk" },
  { code: "04", name: "State Passport", summary: "由用户拥有、可迁移、可撤销的跨终端状态记忆。", status: "规划中", href: "/products#passport" },
];

export default function Home() {
  const settings = repository.getSettings();
  const insights = repository.listPosts({ type: "article", status: "published" }).slice(0, 3);
  const currentUpdate = repository.listPosts({ type: "update", status: "published" })[0];

  return (
    <main>
      <section className="hero">
        <StateField />
        <BreathingField />
        <div className="hero-grid-lines" aria-hidden="true" />
        <div className="shell hero__inner">
          <div className="hero__copy">
            <p className="hero__stage"><span />{settings.stage_label}</p>
            <h1>序感科技<small>SenseOrder</small></h1>
            <p className="hero__statement">{settings.hero_title}</p>
            <p className="hero__description">{settings.hero_description}</p>
            <div className="hero__actions">
              <Link href="/technology" className="button button--light">理解 State Computing <ArrowUpRight size={17} /></Link>
              <Link href="/contact" className="button button--line">成为设计伙伴 <ArrowRight size={17} /></Link>
            </div>
          </div>
          <div className="hero__readout" aria-label="状态计算维度示意">
            <div className="readout-title"><span>STATE VECTOR</span><b>LIVE CONTEXT</b></div>
            <div className="readout-axis"><span>认知负荷</span><i style={{ "--level": "74%" } as React.CSSProperties} /><b>0.74</b></div>
            <div className="readout-axis"><span>疲劳 / 能量</span><i style={{ "--level": "46%" } as React.CSSProperties} /><b>0.46</b></div>
            <div className="readout-axis"><span>唤醒度</span><i style={{ "--level": "61%" } as React.CSSProperties} /><b>0.61</b></div>
            <div className="readout-axis"><span>社交可用性</span><i style={{ "--level": "29%" } as React.CSSProperties} /><b>0.29</b></div>
            <p><span>CONFIDENCE</span><b>0.82</b><em>允许保持未知</em></p>
          </div>
        </div>
        <div className="hero__foot shell">
          <span>STATE COMPUTING / 2026</span>
          <a href="#definition">向下探索 <ArrowDown size={14} /></a>
          <span>SHANGHAI, CHINA</span>
        </div>
      </section>

      <section className="definition section" id="definition">
        <div className="shell">
          <SectionHeading
            index="01"
            eyebrow="THE NEXT CONTEXT LAYER"
            title={<>AI 已经理解语言。<br />下一步，是理解人的状态。</>}
            description="不是把人压缩成一个情绪标签，而是让设备在授权下理解实时状态、长期节律和行动结果。"
          />
          <div className="definition-grid">
            <div className="definition-quote">
              <span>STATE COMPUTING</span>
              <p>一种以人的动态状态为计算对象，通过信号、个体基线、长期记忆与结果反馈形成可测量闭环的计算范式。</p>
            </div>
            <div className="definition-points">
              <div><b>动态</b><p>状态随时间、任务和环境变化，不是固定人格。</p></div>
              <div><b>概率</b><p>每次判断保留置信度、缺失信号与未知。</p></div>
              <div><b>可行动</b><p>理解必须转化为可逆、可反馈、可衡量的帮助。</p></div>
              <div><b>用户主权</b><p>状态与记忆可查看、纠正、暂停、导出和删除。</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="state-loop section section--tint">
        <div className="shell">
          <SectionHeading
            index="02"
            eyebrow="THE PRODUCT UNIT"
            title={<>一次理解，必须成为<br />一次可验证的状态闭环。</>}
            description="State Loop 不是一次识别，而是从信号到结果的完整循环。原始敏感数据默认不离端。"
          />
          <StateLoopDiagram />
        </div>
      </section>

      <section className="products-overview section section--dark">
        <div className="shell">
          <SectionHeading
            index="03"
            eyebrow="PRODUCT ARCHITECTURE"
            title={<>先构建引擎，<br />再赢得平台。</>}
            description="序感以软件闭环为核心，以参考终端验证能力；产品阶段由证据解锁，而不是由日期自动发生。"
            inverse
          />
          <div className="product-rows">
            {productLayers.map((product) => (
              <Link href={product.href} className="product-row" key={product.name}>
                <span className="product-row__code">{product.code}</span>
                <h3>{product.name}</h3>
                <p>{product.summary}</p>
                <em>{product.status}</em>
                <ArrowUpRight size={20} strokeWidth={1.4} />
              </Link>
            ))}
          </div>
          <div className="reference-note">
            <span>REFERENCE TERMINALS</span>
            <p><b>CAMI</b> 与未来的 <b>Sense ONE</b> 是验证与示范终端，不是序感的公司边界。</p>
            <Link href="/products#terminals">了解参考终端 <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="trust section">
        <div className="shell">
          <SectionHeading
            index="04"
            eyebrow="TRUST ARCHITECTURE"
            title={<>理解越深入，<br />边界越要清楚。</>}
            description="状态推断涉及高度敏感的个人信息。信任不是合规附件，而是产品架构本身。"
          />
          <div className="trust-grid">
            <div className="trust-manifesto">
              <span>USER SOVEREIGNTY</span>
              <blockquote>“你的状态数据，永远属于你。”</blockquote>
              <p>序感不把情绪用于招聘、绩效、保险、信用判断或差别待遇。</p>
            </div>
            <div className="trust-principles">
              <div><span>01</span><h3>端侧优先</h3><p>原始音频生产环境默认不持久化，敏感特征尽量在端侧处理。</p></div>
              <div><span>02</span><h3>最小必要</h3><p>每个终端只获得完成当前任务所需的最少状态摘要。</p></div>
              <div><span>03</span><h3>可纠正</h3><p>用户可以查看判断依据、纠正结果并关闭任意信号类别。</p></div>
              <div><span>04</span><h3>可撤销</h3><p>授权、跨端同步与个体记忆都可暂停、导出、重置或删除。</p></div>
            </div>
          </div>
        </div>
      </section>

      {currentUpdate && (
        <section className="evidence-band">
          <div className="shell evidence-band__inner">
            <span>{currentUpdate.eyebrow}</span>
            <h2>{currentUpdate.title}</h2>
            <p>{currentUpdate.excerpt}</p>
            <Link href={`/insights/${currentUpdate.slug}`}>查看进展 <ArrowUpRight size={18} /></Link>
          </div>
        </section>
      )}

      <section className="insights-home section">
        <div className="shell">
          <SectionHeading
            index="05"
            eyebrow="LATEST THINKING"
            title="公开我们如何思考，也公开我们仍不知道什么。"
            description="关于状态计算、长期记忆、可信治理与产品验证的持续记录。"
          />
          <div className="insight-grid">
            {insights.map((post) => <InsightCard post={post} key={post.id} />)}
          </div>
          <Link href="/insights" className="text-link">查看全部洞察 <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="home-contact section section--cyan">
        <div className="shell home-contact__inner">
          <span>BUILD THE FIRST LOOP</span>
          <h2>寻找愿意一起定义<br />状态智能的设计伙伴。</h2>
          <p>{settings.contact_note}</p>
          <Link href="/contact" className="button button--dark">开始一次对话 <ArrowUpRight size={18} /></Link>
        </div>
      </section>
    </main>
  );
}
