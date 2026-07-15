"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";

const statusLabels: Record<LeadStatus, string> = { new: "新线索", contacted: "已联系", qualified: "有效", closed: "已关闭" };
const topicLabels: Record<string, string> = { partner: "终端 / 设计伙伴", research: "研究合作", media: "媒体与内容", career: "人才", other: "其他" };

export function LeadsManager({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const selected = leads.find((lead) => lead.id === selectedId);

  function updateSelected(changes: Partial<Lead>) {
    setLeads((current) => current.map((lead) => lead.id === selectedId ? { ...lead, ...changes } : lead));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    const response = await fetch(`/api/admin/leads/${selected.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: selected.status, note: selected.note }) });
    const result = await response.json();
    if (response.ok) setLeads((current) => current.map((lead) => lead.id === result.lead.id ? result.lead : lead));
    setSaving(false);
  }

  return (
    <>
      <div className="admin-page-head"><div><span>INQUIRIES</span><h1>合作线索</h1><p>查看官网表单并维护跟进状态。</p></div></div>
      {leads.length === 0 ? <div className="admin-empty admin-empty--large">还没有收到合作线索。</div> : (
        <div className="leads-layout">
          <div className="leads-list">{leads.map((lead) => <button key={lead.id} type="button" className={lead.id === selectedId ? "is-active" : ""} onClick={() => setSelectedId(lead.id)}><div><b>{lead.name}</b><span>{lead.organization || "个人"}</span></div><p>{lead.message}</p><footer><span className={`admin-status admin-status--${lead.status}`}>{statusLabels[lead.status]}</span><time>{lead.createdAt.slice(0, 10)}</time></footer></button>)}</div>
          {selected && <section className="lead-detail"><header><div><span>{topicLabels[selected.topic] || selected.topic}</span><h2>{selected.name}</h2><p>{selected.organization || "个人联系"}</p></div><a href={`mailto:${selected.email}`}>{selected.email}</a></header><div className="lead-contact-grid"><div><span>电话</span><b>{selected.phone || "未提供"}</b></div><div><span>提交时间</span><b>{new Date(selected.createdAt).toLocaleString("zh-CN")}</b></div></div><article><span>合作说明</span><p>{selected.message}</p></article><label><span>跟进状态</span><select value={selected.status} onChange={(event) => updateSelected({ status: event.target.value as LeadStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>内部备注</span><textarea rows={7} value={selected.note} onChange={(event) => updateSelected({ note: event.target.value })} placeholder="记录下一步、责任人或判断。" /></label><button className="admin-primary" type="button" onClick={save} disabled={saving}><Save size={16} />{saving ? "保存中" : "保存跟进"}</button></section>}
        </div>
      )}
    </>
  );
}
