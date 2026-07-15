import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { repository } from "@/lib/repository";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "序感科技 SenseOrder | 个人状态智能基础设施",
    template: "%s | 序感科技 SenseOrder",
  },
  description: "序感科技构建面向下一代 AI 终端的个人状态智能基础设施，让设备在用户授权下理解状态、延续记忆并采取克制的行动。",
  openGraph: {
    title: "序感科技 SenseOrder",
    description: "让每一个 AI 终端，理解此刻的你，也记得长期的你。",
    type: "website",
    locale: "zh_CN",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = repository.getSettings();
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <SiteChrome settings={settings}>{children}</SiteChrome>
      </body>
    </html>
  );
}
