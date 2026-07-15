import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { RichText } from "@/components/RichText";
import { RoadmapTimeline } from "@/components/RoadmapTimeline";
import { SectionHeading } from "@/components/SectionHeading";
import { SubpageHero } from "@/components/SubpageHero";
import { repository } from "@/lib/repository";

export const metadata: Metadata = {
  title: "关于",
  description: "序感科技的使命、价值观、十年路线、责任边界与开放岗位。",
};

export const dynamic = "force-dynamic";

const values = [
  ["SENSE", "感知", "真正理解人的变化，而不是等待更多指令。"],
  ["RESTRAINT", "克制", "少即是多。模型知道何时行动，也知道何时安静。"],
  ["COMPANION", "陪伴", "长期关系来自被验证的理解，不来自拟人的表演。"],
  ["AUTHENTIC", "真实", "不把目标写成成果，不用流畅语言掩盖不确定性。"],
  ["EVOLVING", "进化", "每一个模型、产品和公司假设都可以被证据改写。"],
];

export default function AboutPage() {
  const jobs = repository.listPosts({ type: "job", status: "published" });
  return (
    <main>
      <SubpageHero
        eyebrow="ABOUT / SENSEORDER"
        title={<>为下一代 AI 终端，<br />建立一层关于“人”的上下文。</>}
        description="序感科技是一家面向下一代 AI 终端的个人状态智能基础设施公司。我们从一个可反复成立的真实用户闭环开始。"
        meta={["上海", "AI Native", "证据解锁", "人类负责"]}
      />

      <section className="mission section">
        <div className="shell">
          <SectionHeading index="01" eyebrow="MISSION" title={<>让每一个 AI 终端，<br />理解此刻的你，也记得长期的你。</>} description="我们不与每一种终端竞争。我们让不同终端在用户授权下共享最少且必要的状态上下文。" />
          <div className="mission-statement"><span>LONG-TERM PROMISE</span><p>让每个人拥有自己的状态记忆，<br />而不是被平台拥有。</p></div>
        </div>
      </section>

      <section className="values section section--dark">
        <div className="shell">
          <SectionHeading index="02" eyebrow="VALUES" title="安静、敏锐、笃定，也足够诚实。" description="品牌价值也是产品与公司运行的约束。" inverse />
          <div className="value-list">
            {values.map(([english, chinese, description], index) => <div key={english}><span>0{index + 1}</span><h3>{english}<small>{chinese}</small></h3><p>{description}</p></div>)}
          </div>
        </div>
      </section>

      <section className="roadmap section section--tint">
        <div className="shell">
          <SectionHeading index="03" eyebrow="TEN-YEAR DIRECTION" title="每一阶段由证据解锁，而不是由日期自动发生。" description="路线图表达方向，不是对外承诺。阶段出口是可验证的用户价值、技术复用与可信治理。" />
          <RoadmapTimeline />
        </div>
      </section>

      <section className="accountability section">
        <div className="shell">
          <SectionHeading index="04" eyebrow="HUMAN ACCOUNTABILITY" title="AI 承担高频认知劳动，人类承担方向与责任。" description="AI-native 公司不是无人公司。法律、数据用途、模型发布和不可逆决策必须有明确的人类责任主体。" />
          <div className="accountability-grid">
            <div><span>AI AGENTS</span><h3>研究、分析、草拟、编码、测试、监测</h3><p>放大团队的认知与执行效率，但不拥有签约、用款或最终发布权。</p></div>
            <div><span>HUMAN GOVERNANCE</span><h3>使命、资本、数据用途、模型发布、安全事件</h3><p>由创始人、技术负责人和专业顾问承担最终责任与复核。</p></div>
          </div>
        </div>
      </section>

      <section className="careers section section--tint" id="careers">
        <div className="shell">
          <SectionHeading index="05" eyebrow="CAREERS" title="加入一个仍在证明自己的新基础层。" description="我们只发布已经被工作量和责任解锁的岗位。" />
          <div className="career-list">
            {jobs.map((job) => <details key={job.id}><summary><span>{job.eyebrow}</span><h3>{job.title}</h3><p>{job.excerpt}</p><ArrowUpRight size={20} /></summary><div><RichText value={job.body} /><Link href={`/contact?topic=career&role=${job.slug}`}>申请这个岗位 <ArrowRight size={16} /></Link></div></details>)}
          </div>
        </div>
      </section>
    </main>
  );
}
