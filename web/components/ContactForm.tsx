"use client";

import { ArrowRight, Check } from "lucide-react";
import { FormEvent, useState } from "react";

const topics = [
  ["partner", "终端 / 设计伙伴"],
  ["research", "研究合作"],
  ["media", "媒体与内容"],
  ["career", "加入序感"],
  ["other", "其他"],
] as const;

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败");
      setStatus("success");
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "提交失败，请稍后再试");
    }
  }

  if (status === "success") {
    return (
      <div className="form-success" role="status">
        <span><Check size={22} /></span>
        <h2>信息已经收到。</h2>
        <p>我们会先判断双方是否有明确、可验证的合作起点，再与你联系。</p>
        <button type="button" onClick={() => setStatus("idle")}>提交另一条信息</button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="honeypot" aria-hidden="true">
        <label>公司网站<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <fieldset>
        <legend>你希望讨论什么？</legend>
        <div className="topic-options">
          {topics.map(([value, label], index) => (
            <label key={value}>
              <input type="radio" name="topic" value={value} defaultChecked={index === 0} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label><span>姓名 *</span><input name="name" required minLength={2} maxLength={80} placeholder="你的姓名" /></label>
        <label><span>组织</span><input name="organization" maxLength={120} placeholder="公司 / 机构" /></label>
        <label><span>邮箱 *</span><input name="email" required type="email" maxLength={200} placeholder="name@company.com" /></label>
        <label><span>电话</span><input name="phone" maxLength={40} placeholder="便于联系的号码" /></label>
      </div>
      <label className="form-message"><span>请简单描述合作起点 *</span><textarea name="message" required minLength={10} maxLength={3000} rows={6} placeholder="现有终端、用户场景、可用信号，以及你希望验证的问题。" /></label>
      <div className="form-submit-row">
        <p>提交即表示你同意我们仅为本次沟通处理这些信息。</p>
        <button className="button button--dark" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在提交" : "提交信息"}<ArrowRight size={17} />
        </button>
      </div>
      {status === "error" && <p className="form-error" role="alert">{message}</p>}
    </form>
  );
}
