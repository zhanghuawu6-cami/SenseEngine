"use client";

import { FileText, Image as ImageIcon, Inbox, LayoutDashboard, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

const links = [
  ["/admin", "总览", LayoutDashboard],
  ["/admin/content", "内容", FileText],
  ["/admin/leads", "线索", Inbox],
  ["/admin/media", "媒体", ImageIcon],
  ["/admin/settings", "设置", Settings],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-sidebar__brand"><BrandMark /></Link>
        <nav aria-label="后台导航">
          {links.map(([href, label, Icon]) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return <Link href={href} key={href} className={active ? "is-active" : ""}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></Link>;
          })}
        </nav>
        <button type="button" onClick={logout} title="退出登录"><LogOut size={17} /><span>退出</span></button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><span>序感科技</span><b>内容运营系统</b></div><Link href="/" target="_blank">查看官网</Link></header>
        {children}
      </div>
    </div>
  );
}
