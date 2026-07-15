import { ArrowRight, FileText, Image as ImageIcon, Inbox, PenLine } from "lucide-react";
import Link from "next/link";
import { repository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AdminDashboardPage() {
  const stats = repository.getDashboardStats();
  const leads = repository.listLeads().slice(0, 5);
  const recent = repository.listPosts().slice(0, 5);
  return (
    <main className="admin-content">
      <div className="admin-page-head"><div><span>DASHBOARD</span><h1>运营总览</h1><p>公开内容、合作线索与媒体资产的当前状态。</p></div><Link className="admin-primary" href="/admin/content"><PenLine size={16} /> 新建内容</Link></div>
      <div className="admin-stat-grid"><article><FileText size={19} /><span>已发布内容</span><b>{stats.published}</b><Link href="/admin/content">查看内容 <ArrowRight size={14} /></Link></article><article><PenLine size={19} /><span>待完成草稿</span><b>{stats.drafts}</b><Link href="/admin/content">继续编辑 <ArrowRight size={14} /></Link></article><article><Inbox size={19} /><span>新合作线索</span><b>{stats.newLeads}</b><Link href="/admin/leads">开始跟进 <ArrowRight size={14} /></Link></article><article><ImageIcon size={19} /><span>媒体资产</span><b>{stats.media}</b><Link href="/admin/media">打开媒体库 <ArrowRight size={14} /></Link></article></div>
      <div className="admin-dashboard-grid"><section><header><h2>最近内容</h2><Link href="/admin/content">全部内容</Link></header><div className="dashboard-list">{recent.map((post) => <Link href="/admin/content" key={post.id}><span className={`admin-status admin-status--${post.status}`}>{post.status === "published" ? "已发布" : post.status === "draft" ? "草稿" : "归档"}</span><div><b>{post.title}</b><small>{post.type} · {post.updatedAt.slice(0, 10)}</small></div><ArrowRight size={14} /></Link>)}</div></section><section><header><h2>最新线索</h2><Link href="/admin/leads">全部线索</Link></header>{leads.length ? <div className="dashboard-list">{leads.map((lead) => <Link href="/admin/leads" key={lead.id}><span className={`admin-status admin-status--${lead.status}`}>{lead.status === "new" ? "新线索" : "跟进中"}</span><div><b>{lead.name} · {lead.organization || "个人"}</b><small>{lead.topic} · {lead.createdAt.slice(0, 10)}</small></div><ArrowRight size={14} /></Link>)}</div> : <div className="admin-empty">还没有合作线索。</div>}</section></div>
    </main>
  );
}
