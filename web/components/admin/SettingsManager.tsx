"use client";

import { Save } from "lucide-react";
import { FormEvent, useState } from "react";
import type { SiteSettings } from "@/lib/types";

const fields = [
  ["site_name", "站点名称", "公开站点的品牌名称。", false],
  ["stage_label", "当前阶段", "首页首屏与页脚显示的阶段标签。", false],
  ["hero_title", "首页核心主张", "首页最重要的一句话。", true],
  ["hero_description", "首页定位说明", "解释序感是谁、为谁提供什么。", true],
  ["contact_note", "合作说明", "首页和联系页使用的合作引导。", true],
  ["footer_notice", "页脚原则", "每一页最后重复的内容底线。", true],
] as const;

export function SettingsManager({ initialSettings }: { initialSettings: SiteSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    if (!response.ok) setStatus("error");
    else {
      const result = await response.json();
      setSettings(result.settings);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <>
      <div className="admin-page-head"><div><span>GLOBAL SETTINGS</span><h1>站点设置</h1><p>维护跨页面使用的品牌文案。</p></div></div>
      <form className="settings-form" onSubmit={save}>{fields.map(([key, label, help, multiline]) => <label key={key}><div><b>{label}</b><span>{help}</span></div>{multiline ? <textarea rows={3} maxLength={2000} value={settings[key] || ""} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} /> : <input maxLength={2000} value={settings[key] || ""} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} />}</label>)}<footer><span className={status === "error" ? "is-error" : ""}>{status === "saved" ? "设置已更新" : status === "error" ? "保存失败" : "修改将在刷新公开页面后生效。"}</span><button className="admin-primary" type="submit" disabled={status === "saving"}><Save size={16} />{status === "saving" ? "保存中" : "保存设置"}</button></footer></form>
    </>
  );
}
