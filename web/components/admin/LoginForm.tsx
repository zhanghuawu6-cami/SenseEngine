"use client";

import { ArrowRight, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

export function LoginForm({ showHint }: { showHint: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "登录失败");
      setLoading(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="admin-login">
      <section className="admin-login__brand">
        <BrandMark />
        <div><span>CONTENT OPERATIONS</span><h1>保持品牌叙事与证据同步。</h1><p>管理洞察、进展、岗位、媒体和合作线索。所有公开内容都应区分目标、验证与已发布状态。</p></div>
      </section>
      <section className="admin-login__form-wrap">
        <form onSubmit={submit} className="admin-login__form">
          <span className="admin-login__icon"><LockKeyhole size={20} /></span>
          <h2>内容管理后台</h2>
          <p>使用管理员账号继续。</p>
          <label><span>账号</span><input type="email" name="email" required autoComplete="username" defaultValue={showHint ? "admin@senseorder.local" : ""} /></label>
          <label><span>密码</span><input type="password" name="password" required minLength={8} autoComplete="current-password" defaultValue={showHint ? "change-me-now" : ""} /></label>
          {error && <div className="admin-form-error" role="alert">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "正在验证" : "登录后台"}<ArrowRight size={16} /></button>
          {showHint && <small>开发环境已填入默认账号。公开部署前必须修改环境变量。</small>}
        </form>
      </section>
    </main>
  );
}
