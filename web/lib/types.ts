export type ContentType = "article" | "update" | "job";
export type PublishStatus = "draft" | "published" | "archived";
export type LeadStatus = "new" | "contacted" | "qualified" | "closed";

export interface ContentPost {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  eyebrow: string;
  excerpt: string;
  body: string;
  status: PublishStatus;
  publishedAt: string;
  sortOrder: number;
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  name: string;
  organization: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: LeadStatus;
  note: string;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface DashboardStats {
  published: number;
  drafts: number;
  newLeads: number;
  media: number;
}

export type SiteSettings = Record<string, string>;
