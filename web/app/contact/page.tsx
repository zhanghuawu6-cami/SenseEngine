import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { SubpageHero } from "@/components/SubpageHero";
import { repository } from "@/lib/repository";

export const metadata: Metadata = {
  title: "联系",
  description: "联系序感科技，讨论终端合作、状态智能研究、媒体或人才机会。",
};

export const dynamic = "force-dynamic";

export default function ContactPage() {
  const settings = repository.getSettings();
  return (
    <main>
      <SubpageHero
        eyebrow="CONTACT / START WITH A TASK"
        title={<>从一个可测量的<br />真实任务开始。</>}
        description={settings.contact_note}
        meta={["终端伙伴", "研究机构", "早期用户", "人才"]}
      />
      <section className="contact-section section" id="inquiry">
        <div className="shell contact-layout">
          <aside>
            <span>WHAT MAKES A GOOD START</span>
            <h2>一个好的合作起点，通常具备三件事。</h2>
            <ol><li><b>真实终端</b><p>已有可接入信号、明确用户与具体场景。</p></li><li><b>明确授权</b><p>用户知道收集什么、为什么收集，并能撤回。</p></li><li><b>可验证结果</b><p>帮助是否有效，能通过反馈或行为结果判断。</p></li></ol>
            <div><span>LOCATION</span><p>Shanghai, China<br />上海，中国</p></div>
          </aside>
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
