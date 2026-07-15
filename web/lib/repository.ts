import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import type {
  ContentPost,
  ContentType,
  DashboardStats,
  Lead,
  LeadStatus,
  MediaAsset,
  PublishStatus,
  SiteSettings,
} from "@/lib/types";

type Row = Record<string, string | number | null>;

function mapPost(row: Row): ContentPost {
  return {
    id: String(row.id),
    type: String(row.type) as ContentType,
    slug: String(row.slug),
    title: String(row.title),
    eyebrow: String(row.eyebrow),
    excerpt: String(row.excerpt),
    body: String(row.body),
    status: String(row.status) as PublishStatus,
    publishedAt: String(row.published_at),
    sortOrder: Number(row.sort_order),
    coverUrl: String(row.cover_url),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLead(row: Row): Lead {
  return {
    id: String(row.id),
    name: String(row.name),
    organization: String(row.organization),
    email: String(row.email),
    phone: String(row.phone),
    topic: String(row.topic),
    message: String(row.message),
    status: String(row.status) as LeadStatus,
    note: String(row.note),
    createdAt: String(row.created_at),
  };
}

function mapMedia(row: Row): MediaAsset {
  return {
    id: String(row.id),
    filename: String(row.filename),
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    url: String(row.url),
    createdAt: String(row.created_at),
  };
}

export const repository = {
  listPosts(options: { type?: ContentType; status?: PublishStatus } = {}) {
    const where: string[] = [];
    const values: string[] = [];
    if (options.type) {
      where.push("type = ?");
      values.push(options.type);
    }
    if (options.status) {
      where.push("status = ?");
      values.push(options.status);
    }
    const sql = `SELECT * FROM posts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort_order ASC, published_at DESC`;
    return (getDatabase().prepare(sql).all(...values) as Row[]).map(mapPost);
  },

  getPost(id: string) {
    const row = getDatabase().prepare("SELECT * FROM posts WHERE id = ?").get(id) as Row | undefined;
    return row ? mapPost(row) : null;
  },

  getPublishedPostBySlug(slug: string) {
    const row = getDatabase()
      .prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'")
      .get(slug) as Row | undefined;
    return row ? mapPost(row) : null;
  },

  createPost(input: Omit<ContentPost, "id" | "createdAt" | "updatedAt">) {
    const id = randomUUID();
    const now = new Date().toISOString();
    getDatabase()
      .prepare(`
        INSERT INTO posts
          (id, type, slug, title, eyebrow, excerpt, body, status, published_at, sort_order, cover_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.type,
        input.slug,
        input.title,
        input.eyebrow,
        input.excerpt,
        input.body,
        input.status,
        input.publishedAt,
        input.sortOrder,
        input.coverUrl,
        now,
        now,
      );
    return this.getPost(id);
  },

  updatePost(id: string, input: Omit<ContentPost, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const result = getDatabase()
      .prepare(`
        UPDATE posts SET
          type = ?, slug = ?, title = ?, eyebrow = ?, excerpt = ?, body = ?, status = ?,
          published_at = ?, sort_order = ?, cover_url = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.type,
        input.slug,
        input.title,
        input.eyebrow,
        input.excerpt,
        input.body,
        input.status,
        input.publishedAt,
        input.sortOrder,
        input.coverUrl,
        now,
        id,
      );
    return result.changes ? this.getPost(id) : null;
  },

  deletePost(id: string) {
    return getDatabase().prepare("DELETE FROM posts WHERE id = ?").run(id).changes > 0;
  },

  listLeads() {
    return (getDatabase().prepare("SELECT * FROM leads ORDER BY created_at DESC").all() as Row[]).map(mapLead);
  },

  createLead(input: Pick<Lead, "name" | "organization" | "email" | "phone" | "topic" | "message">) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDatabase()
      .prepare(`
        INSERT INTO leads (id, name, organization, email, phone, topic, message, status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new', '', ?)
      `)
      .run(id, input.name, input.organization, input.email, input.phone, input.topic, input.message, createdAt);
    return mapLead(
      getDatabase().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Row,
    );
  },

  updateLead(id: string, status: LeadStatus, note: string) {
    const result = getDatabase()
      .prepare("UPDATE leads SET status = ?, note = ? WHERE id = ?")
      .run(status, note, id);
    if (!result.changes) return null;
    return mapLead(getDatabase().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Row);
  },

  getSettings(): SiteSettings {
    const rows = getDatabase().prepare("SELECT key, value FROM settings").all() as Row[];
    return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  },

  updateSettings(settings: SiteSettings) {
    const db = getDatabase();
    const statement = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    db.exec("BEGIN");
    try {
      Object.entries(settings).forEach(([key, value]) => statement.run(key, value));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return this.getSettings();
  },

  listMedia() {
    return (getDatabase().prepare("SELECT * FROM media ORDER BY created_at DESC").all() as Row[]).map(mapMedia);
  },

  createMedia(input: Omit<MediaAsset, "id" | "createdAt">) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDatabase()
      .prepare(`
        INSERT INTO media (id, filename, original_name, mime_type, size, url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, input.filename, input.originalName, input.mimeType, input.size, input.url, createdAt);
    return mapMedia(getDatabase().prepare("SELECT * FROM media WHERE id = ?").get(id) as Row);
  },

  getMedia(id: string) {
    const row = getDatabase().prepare("SELECT * FROM media WHERE id = ?").get(id) as Row | undefined;
    return row ? mapMedia(row) : null;
  },

  getMediaByFilename(filename: string) {
    const row = getDatabase()
      .prepare("SELECT * FROM media WHERE filename = ?")
      .get(filename) as Row | undefined;
    return row ? mapMedia(row) : null;
  },

  deleteMedia(id: string) {
    return getDatabase().prepare("DELETE FROM media WHERE id = ?").run(id).changes > 0;
  },

  getDashboardStats(): DashboardStats {
    const db = getDatabase();
    const scalar = (sql: string) => Number((db.prepare(sql).get() as { count: number }).count);
    return {
      published: scalar("SELECT COUNT(*) AS count FROM posts WHERE status = 'published'"),
      drafts: scalar("SELECT COUNT(*) AS count FROM posts WHERE status = 'draft'"),
      newLeads: scalar("SELECT COUNT(*) AS count FROM leads WHERE status = 'new'"),
      media: scalar("SELECT COUNT(*) AS count FROM media"),
    };
  },
};
