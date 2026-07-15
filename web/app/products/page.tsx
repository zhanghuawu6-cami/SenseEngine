import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { SubpageHero } from "@/components/SubpageHero";

export const metadata: Metadata = {
  title: "产品",
  description: "序感科技的 Sense State Lab、State Runtime、State SDK、State Passport 与参考终端。",
};

const products = [
  {
    id: "state-lab", number: "01", name: "Sense State Lab", state: "VALIDATING / 验证中",
    title: "先在真实生活里，证明一个状态闭环。",
    description: "面向早期用户与设计伙伴的研究应用。围绕高强度知识工作者，验证认知负荷、疲劳与压力变化是否能被可靠理解，并帮助用户在专注、恢复和减少打扰之间切换。",
    bullets: ["电脑活动、日历、短时自评与可选穿戴", "相对规则基线评估个体模型增益", "以接受、调整、拒绝和打扰率衡量结果"],
  },
  {
    id: "runtime", number: "02", name: "State Runtime", state: "BUILDING / 核心构建",
    title: "把状态智能做成可部署、可评测、可回滚的运行时。",
    description: "序感的核心产品层。它不绑定单一硬件或大模型，在端侧与云端之间组织信号、状态、记忆、策略和治理，让不同终端共享同一套数据与责任契约。",
    bullets: ["Signal / State / Memory / Policy / Outcome 数据契约", "端侧优先与按授权跨端同步", "模型版本、异常、撤回、回滚与审计记录"],
  },
  {
    id: "sdk", number: "03", name: "State SDK", state: "DESIGN PARTNER / 设计伙伴",
    title: "让终端厂商在明确边界内接入状态能力。",
    description: "面向 PC、耳机、汽车、穿戴、家居与机器人伙伴的 API、工具包、评测套件和沙箱。合作从一项可衡量任务开始，而不是从采购一套宏大平台开始。",
    bullets: ["2-4 周接入评估与信号可用性检查", "离线回放、基线对比与安全回滚", "不开放原始敏感数据给第三方应用"],
  },
  {
    id: "passport", number: "04", name: "State Passport", state: "RESEARCH / 规划中",
    title: "让用户带走自己的状态记忆。",
    description: "长期方向是一份由用户拥有的跨终端状态账户，承载授权、偏好、节律、纠正与记忆。它只向每个终端提供完成当前任务所需的最少摘要。",
    bullets: ["两类终端打通后才进入产品化", "支持查看、纠正、导出、暂停与删除", "跨品牌中立，不依附广告或雇主利益"],
  },
];

export default function ProductsPage() {
  return (
    <main>
      <SubpageHero
        eyebrow="PRODUCTS / EVIDENCE-LED"
        title={<>产品由证据解锁，<br />而不是由路线图自动发生。</>}
        description="从研究应用到运行时、SDK 与跨终端记忆，每一层都必须先证明真实用户价值、技术增益与可信边界。"
        meta={["研究", "运行时", "合作工具", "用户记忆"]}
      />
      <section className="product-detail-list section">
        <div className="shell">
          {products.map((product) => (
            <article className="product-detail" id={product.id} key={product.id}>
              <div className="product-detail__meta"><span>{product.number}</span><h2>{product.name}</h2><em>{product.state}</em></div>
              <div className="product-detail__copy"><h3>{product.title}</h3><p>{product.description}</p></div>
              <ul>{product.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="terminals section section--dark" id="terminals">
        <div className="shell">
          <SectionHeading index="05" eyebrow="REFERENCE TERMINALS" title={<>终端是验证场，<br />不是公司的边界。</>} description="参考终端用于证明同一套状态记忆能否迁移到不同场景，核心数据结构不分叉。" inverse />
          <div className="terminal-grid">
            <div className="terminal-item"><span>CAR / AVAILABLE RESEARCH ENTRY</span><h3>CAMI</h3><p>车载场景与既有用户研究入口，用于疲劳、压力与跨端记忆迁移验证。</p><em>参考终端</em></div>
            <div className="terminal-item"><span>HOME / RESTART AFTER EVIDENCE</span><h3>Sense ONE</h3><p>家庭环境状态终端概念。待软件闭环、两类终端与家庭行动价值成立后重启。</p><em>暂缓量产</em></div>
            <div className="terminal-item"><span>PARTNER / CO-CREATED</span><h3>Partner Devices</h3><p>与 PC、耳机、穿戴、汽车和空间设备伙伴共同验证 State Runtime 的可迁移性。</p><em>开放共创</em></div>
          </div>
        </div>
      </section>

      <section className="partner-callout section section--cyan">
        <div className="shell partner-callout__inner"><span>DESIGN PARTNERS</span><h2>从一个可测量任务开始。</h2><p>如果你拥有真实终端、明确授权与可验证结果，我们可以共同设计第一个 State Loop。</p><Link href="/contact" className="button button--dark">讨论合作起点 <ArrowRight size={17} /></Link></div>
      </section>
    </main>
  );
}
