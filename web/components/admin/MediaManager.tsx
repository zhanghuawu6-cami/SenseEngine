"use client";

import { Clipboard, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { FormEvent, useState } from "react";
import type { MediaAsset } from "@/lib/types";

export function MediaManager({ initialMedia }: { initialMedia: MediaAsset[] }) {
  const [media, setMedia] = useState(initialMedia);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch("/api/admin/media", { method: "POST", body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "上传失败");
    else {
      setMedia((current) => [result.media, ...current]);
      form.reset();
    }
    setUploading(false);
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm(`确认删除“${asset.originalName}”？`)) return;
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE" });
    if (response.ok) setMedia((current) => current.filter((item) => item.id !== asset.id));
  }

  return (
    <>
      <div className="admin-page-head"><div><span>MEDIA</span><h1>媒体库</h1><p>上传 PNG、JPG 或 WebP，单个文件不超过 6MB。</p></div></div>
      <form className="media-upload" onSubmit={upload}><ImagePlus size={23} /><div><b>上传图片</b><span>文件将保存到站点媒体目录，可在内容封面中引用。</span></div><input type="file" name="file" accept="image/png,image/jpeg,image/webp" required /><button className="admin-primary" type="submit" disabled={uploading}>{uploading ? "上传中" : "开始上传"}</button>{error && <p>{error}</p>}</form>
      <div className="media-grid">
        {media.map((asset) => <article key={asset.id}><div className="media-preview"><Image src={asset.url} alt={asset.originalName} fill sizes="(max-width: 800px) 50vw, 240px" /></div><div><b title={asset.originalName}>{asset.originalName}</b><span>{(asset.size / 1024).toFixed(1)} KB · {asset.createdAt.slice(0, 10)}</span></div><footer><code>{asset.url}</code><button type="button" title="复制路径" onClick={() => navigator.clipboard.writeText(asset.url)}><Clipboard size={14} /></button><button type="button" title="删除" onClick={() => remove(asset)}><Trash2 size={14} /></button></footer></article>)}
      </div>
      {media.length === 0 && <div className="admin-empty admin-empty--large">媒体库为空。上传第一张官网图片。</div>}
    </>
  );
}
