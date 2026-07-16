import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import type { SiteSettings } from "@/lib/types";

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-top">
          <div>
            <BrandMark />
            <p>{settings.footer_notice}</p>
          </div>
          <Link href="/contact" className="footer-cta">
            与序感一起定义下一层计算
            <ArrowUpRight size={22} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="footer-grid">
          <div>
            <span className="footer-label">EXPLORE</span>
            <Link href="/technology">技术体系</Link>
            <Link href="/products">产品架构</Link>
            <Link href="/insights">洞察与进展</Link>
            <Link href="/experience">完整体验</Link>
          </div>
          <div>
            <span className="footer-label">COMPANY</span>
            <Link href="/about">关于序感</Link>
            <Link href="/about#careers">加入我们</Link>
            <Link href="/contact">合作联系</Link>
          </div>
          <div>
            <span className="footer-label">STATUS</span>
            <span>Shanghai, China</span>
            <span>{settings.stage_label}</span>
            <Link href="/admin">内容管理</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 SenseOrder Technology</span>
          <span>State Computing · User Sovereignty · Human Accountability</span>
        </div>
      </div>
    </footer>
  );
}
