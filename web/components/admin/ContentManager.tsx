"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { ContentPost, ContentType, PublishStatus } from "@/lib/types";

const emptyPost = (): Omit<ContentPost, "id" | "createdAt" | "updatedAt"> => ({
  type: "article",
  slug: "",
  title: "",
  eyebrow: "",
  excerpt: "",
  body: "",
  status: "draft",
  publishedAt: new Date().toISOString().slice(0, 10),
  sortOrder: 100,
  coverUrl: "",
});

const typeLabels: Record<ContentType, string> = { article: "洞察", update: "进展", job: "岗位" };
const statusLabels: Record<PublishStatus, string> = { draft: "草稿", published: "已发布", archived: "已归档" };

export function ContentManager({ initialPosts }: { initialPosts: ContentPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<"all" | ContentType>("all");
  const [editing, setEditing] = useState<ContentPost | ReturnType<typeof emptyPost> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => filter === "all" ? posts : posts.filter((post) => post.type === filter), [posts, filter]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const isExisting = "id" in editing;
    const response = await fetch(isExisting ? `/api/admin/posts/${editing.id}` : "/api/admin/posts", {
      method: isExisting ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "保存失败");
      setSaving(false);
      return;
    }
    setPosts((current) => isExisting ? current.map((post) => post.id === result.post.id ? result.post : post) : [result.post, ...current]);
    setEditing(null);
    setSaving(false);
  }

  async function remove(post: ContentPost) {
    if (!window.confirm(`确认删除“${post.title}”？此操作无法撤销。`)) return;
    const response = await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    if (response.ok) setPosts((current) => current.filter((item) => item.id !== post.id));
  }

  function update<K extends keyof ReturnType<typeof emptyPost>>(key: K, value: ReturnType<typeof emptyPost>[K]) {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  }

  return (
    <>
      <div className="admin-page-head"><div><span>CONTENT</span><h1>内容管理</h1><p>发布洞察、公司进展和已解锁岗位。</p></div><button type="button" className="admin-primary" onClick={() => setEditing(emptyPost())}><Plus size={16} /> 新建内容</button></div>
      <div className="admin-tabs" role="tablist">{(["all", "article", "update", "job"] as const).map((type) => <button key={type} className={filter === type ? "is-active" : ""} onClick={() => setFilter(type)}>{type === "all" ? "全部" : typeLabels[type]}<span>{type === "all" ? posts.length : posts.filter((post) => post.type === type).length}</span></button>)}</div>
      <div className="admin-table-wrap">
        <table className="admin-table"><thead><tr><th>标题</th><th>类型</th><th>状态</th><th>发布日期</th><th>排序</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filtered.map((post) => <tr key={post.id}><td><b>{post.title}</b><small>/{post.slug}</small></td><td>{typeLabels[post.type]}</td><td><span className={`admin-status admin-status--${post.status}`}>{statusLabels[post.status]}</span></td><td>{post.publishedAt}</td><td>{post.sortOrder}</td><td><div className="admin-actions"><button type="button" title="编辑" onClick={() => setEditing(post)}><Pencil size={15} /></button><button type="button" title="删除" onClick={() => remove(post)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>
        {filtered.length === 0 && <div className="admin-empty">当前筛选下没有内容。</div>}
      </div>

      {editing && (
        <div className="admin-drawer-backdrop" role="presentation">
          <form className="admin-drawer" onSubmit={save}>
            <header><div><span>{"id" in editing ? "EDIT CONTENT" : "NEW CONTENT"}</span><h2>{"id" in editing ? editing.title : "新建内容"}</h2></div><button type="button" title="关闭" onClick={() => setEditing(null)}><X size={19} /></button></header>
            <div className="admin-drawer__body">
              <div className="admin-form-grid admin-form-grid--3"><label><span>类型</span><select value={editing.type} onChange={(event) => update("type", event.target.value as ContentType)}><option value="article">洞察</option><option value="update">进展</option><option value="job">岗位</option></select></label><label><span>状态</span><select value={editing.status} onChange={(event) => update("status", event.target.value as PublishStatus)}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label><label><span>排序</span><input type="number" min="0" max="10000" value={editing.sortOrder} onChange={(event) => update("sortOrder", Number(event.target.value))} /></label></div>
              <label><span>标题</span><input required minLength={2} maxLength={160} value={editing.title} onChange={(event) => update("title", event.target.value)} /></label>
              <div className="admin-form-grid"><label><span>Slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={editing.slug} onChange={(event) => update("slug", event.target.value.toLowerCase())} placeholder="state-computing-update" /></label><label><span>眉题</span><input maxLength={80} value={editing.eyebrow} onChange={(event) => update("eyebrow", event.target.value)} placeholder="RESEARCH 01" /></label></div>
              <label><span>摘要</span><textarea rows={3} maxLength={360} value={editing.excerpt} onChange={(event) => update("excerpt", event.target.value)} /></label>
              <label><span>正文</span><textarea className="admin-editor" rows={16} maxLength={30000} value={editing.body} onChange={(event) => update("body", event.target.value)} placeholder={'使用“## 小标题”组织段落。'} /></label>
              <div className="admin-form-grid"><label><span>发布日期</span><input type="date" required value={editing.publishedAt} onChange={(event) => update("publishedAt", event.target.value)} /></label><label><span>封面 URL</span><input maxLength={500} value={editing.coverUrl} onChange={(event) => update("coverUrl", event.target.value)} placeholder="/uploads/example.png" /></label></div>
              {error && <div className="admin-form-error">{error}</div>}
            </div>
            <footer><button type="button" className="admin-secondary" onClick={() => setEditing(null)}>取消</button><button type="submit" className="admin-primary" disabled={saving}><Save size={16} />{saving ? "保存中" : "保存内容"}</button></footer>
          </form>
        </div>
      )}
    </>
  );
}
