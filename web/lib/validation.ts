import { z } from "zod";

const cleanText = (max: number) => z.string().trim().max(max);

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(200),
});

export const postSchema = z.object({
  type: z.enum(["article", "update", "job"]),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug 仅支持小写字母、数字与连字符"),
  title: cleanText(160).min(2),
  eyebrow: cleanText(80),
  excerpt: cleanText(360),
  body: cleanText(30000),
  status: z.enum(["draft", "published", "archived"]),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  coverUrl: cleanText(500),
});

export const contactSchema = z.object({
  name: cleanText(80).min(2),
  organization: cleanText(120),
  email: z.email().max(200),
  phone: cleanText(40),
  topic: z.enum(["partner", "research", "media", "career", "other"]),
  message: cleanText(3000).min(10),
  companyWebsite: cleanText(200).optional().default(""),
});

export const leadUpdateSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "closed"]),
  note: cleanText(2000),
});

export const settingsSchema = z.record(z.string(), cleanText(2000));
