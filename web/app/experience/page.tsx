import type { Metadata } from "next";
import { ExperienceRunner } from "@/components/experience/ExperienceRunner";
import { ExperienceSections } from "@/components/experience/ExperienceSections";

export const metadata: Metadata = {
  title: "体验 State Loop",
  description: "运行序感科技固定模拟 State Loop，查看状态估计、个体基线与克制干预如何形成完整闭环。",
};

export default function ExperiencePage() {
  return (
    <main>
      <ExperienceRunner />
      <ExperienceSections />
    </main>
  );
}
