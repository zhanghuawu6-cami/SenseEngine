import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const globalForDb = globalThis as unknown as { senseorderDb?: Database.Database };

function seed(db: Database.Database) {
  const now = new Date().toISOString();
  const count = db.prepare("SELECT COUNT(*) AS count FROM posts").get() as { count: number };

  if (count.count === 0) {
    const insert = db.prepare(`
      INSERT INTO posts
        (id, type, slug, title, eyebrow, excerpt, body, status, published_at, sort_order, cover_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const posts = [
      {
        id: "article-state-computing",
        type: "article",
        slug: "what-is-state-computing",
        title: "什么是 State Computing",
        eyebrow: "FOUNDATION 01",
        excerpt: "AI 已经开始理解语言。下一步，是在用户授权下理解人的实时状态、长期节律与行动结果。",
        body: `## 从意图到状态\n\n今天的 AI 很擅长理解人说了什么，却仍然需要人持续表达。State Computing 关注的是另一层问题：此刻的认知负荷、疲劳、唤醒度和可被打扰程度，能否成为设备可理解、可治理的上下文。\n\n## 状态不是标签\n\n状态不是一次情绪识别，也不是心理诊断。它是带概率、置信度、缺失信号和时间变化的估计。系统需要知道自己何时不确定，并允许询问、延迟或保持安静。\n\n## 一个可验证的闭环\n\n序感把一次完整产品单元定义为 State Loop：信号进入，形成状态估计，与个人基线和长期记忆结合，选择可逆行动，再通过接受、调整或拒绝获得结果反馈。只有闭环被真实用户反复确认，平台叙事才有意义。`,
        status: "published",
        publishedAt: "2026-07-13",
        sortOrder: 10,
        coverUrl: "/media/state-loop.png",
      },
      {
        id: "article-uncertainty",
        type: "article",
        slug: "silence-is-a-model-capability",
        title: "为什么“保持安静”也是一种模型能力",
        eyebrow: "TRUST 02",
        excerpt: "状态智能的价值不在于更积极地打扰，而在于知道什么时候行动、询问或克制。",
        body: `## 主动不等于频繁\n\n环境式 AI 很容易滑向另一种通知系统。序感的 State Policy 不只在动作之间选择，也把“暂不行动”视为一等结果。\n\n## 不确定性必须进入产品\n\n每次状态估计都应携带置信度、主要证据和缺失信号。低置信度时，系统可以降低动作级别、请求确认或保持安静，而不是用流畅语言掩盖不确定性。\n\n## 用户保留最终控制\n\n用户可以查看判断依据、纠正结果、关闭某类信号、撤回授权并删除记忆。高风险或不可逆动作必须经过人工确认。克制不是体验上的退让，而是可信状态智能的核心能力。`,
        status: "published",
        publishedAt: "2026-07-06",
        sortOrder: 20,
        coverUrl: "",
      },
      {
        id: "article-memory",
        type: "article",
        slug: "state-memory-across-terminals",
        title: "State Memory：连续性不等于共享原始数据",
        eyebrow: "ENGINEERING 03",
        excerpt: "跨终端协同需要的是最少且必要的状态摘要、权限和记忆，而不是复制所有传感器数据。",
        body: `## 记忆属于用户\n\n序感的长期方向，是让用户拥有可迁移、可撤销的个人 State Passport。它承载偏好、节律、纠正记录与授权，而不是成为平台锁定用户的黑箱。\n\n## 最小必要共享\n\n电脑、耳机、汽车和空间设备不需要彼此获得原始音频或完整行为历史。每个终端只在明确授权下获得完成当前任务所需的最小状态摘要。\n\n## 从两类终端开始\n\n跨终端不是一开始就建设大平台。序感先验证同一份 State Memory 能否在第二类终端复用、核心数据结构不分叉、用户仍能清楚理解和控制。证据成立后，再谈开放协议。`,
        status: "published",
        publishedAt: "2026-06-28",
        sortOrder: 30,
        coverUrl: "",
      },
      {
        id: "update-phase-one",
        type: "update",
        slug: "phase-one-evidence-loop",
        title: "阶段 01：证明状态闭环",
        eyebrow: "CURRENT STAGE",
        excerpt: "2026-2027：围绕真实用户、两类终端与付费设计伙伴，建立可复现的产品和评测闭环。",
        body: `## 阶段目标\n\n当前重点不是发布一个宏大的平台，而是证明状态范围足够清晰、反馈足够可靠、用户价值足够频繁。\n\n## 证据标准\n\n所有进展以真实使用、相对基线增益、行动接受、打扰率、留存、付费和跨端复用衡量。规划数字不等于已经达成的结果。`,
        status: "published",
        publishedAt: "2026-07-13",
        sortOrder: 10,
        coverUrl: "/media/roadmap.png",
      },
      {
        id: "job-founding-engineer",
        type: "job",
        slug: "founding-product-engineer",
        title: "创始产品工程师",
        eyebrow: "SHANGHAI / HYBRID",
        excerpt: "与创始人一起把 State Loop 从原型推进到真实用户闭环，覆盖产品、数据与全栈工程。",
        body: `## 你会负责\n\n搭建早期 State Lab、信号接入与反馈闭环；把模糊产品假设变成可测量实验；共同维护数据最小化、回滚和审计能力。\n\n## 我们看重\n\n强产品判断、可靠工程习惯、对真实世界噪声的耐心，以及在证据不足时主动缩小问题的能力。熟悉 TypeScript、Python、端侧信号或时序建模中的一项即可。\n\n## 责任边界\n\nAI 可以参与研究、编码、测试和文档，但模型发布、数据用途、安全事件与不可逆决策由明确的人类负责人承担。`,
        status: "published",
        publishedAt: "2026-07-13",
        sortOrder: 10,
        coverUrl: "",
      },
    ];

    db.exec("BEGIN");
    try {
      for (const post of posts) {
        insert.run(
          post.id,
          post.type,
          post.slug,
          post.title,
          post.eyebrow,
          post.excerpt,
          post.body,
          post.status,
          post.publishedAt,
          post.sortOrder,
          post.coverUrl,
          now,
          now,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const settings = {
    site_name: "序感科技 SenseOrder",
    hero_title: "让每一个 AI 终端，理解此刻的你，也记得长期的你。",
    hero_description: "序感科技构建面向下一代 AI 终端的个人状态智能基础设施。在用户授权下，让设备理解状态、延续记忆、采取克制的行动。",
    stage_label: "PHASE 01 · PROVING THE LOOP",
    contact_note: "我们正在与 AI 终端厂商、研究机构和早期设计伙伴建立第一批状态闭环。",
    footer_notice: "愿景可以大，证据必须诚实；产品可以主动，用户必须拥有最终控制权。",
  };
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  Object.entries(settings).forEach(([key, value]) => insertSetting.run(key, value));
}

function createDatabase() {
  const configuredPath = process.env.DATABASE_PATH || "./data/senseorder.db";
  const databasePath = path.resolve(process.cwd(), configuredPath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('article', 'update', 'job')),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      eyebrow TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
      published_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      cover_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS posts_public_idx ON posts(type, status, sort_order, published_at);

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status, created_at);

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  seed(db);
  return db;
}

export function getDatabase() {
  if (!globalForDb.senseorderDb) {
    globalForDb.senseorderDb = createDatabase();
  }
  return globalForDb.senseorderDb;
}
