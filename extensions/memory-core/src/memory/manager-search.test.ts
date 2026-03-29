import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { bm25RankToScore, buildFtsQuery } from "./hybrid.js";
import { searchKeyword } from "./manager-search.js";

const FTS_TABLE = "chunks_fts";

function createTrigramDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE VIRTUAL TABLE ${FTS_TABLE} USING fts5(` +
      `text,` +
      `id UNINDEXED,` +
      `path UNINDEXED,` +
      `source UNINDEXED,` +
      `model UNINDEXED,` +
      `start_line UNINDEXED,` +
      `end_line UNINDEXED,` +
      `tokenize='trigram case_sensitive 0'` +
      `);`,
  );
  return db;
}

function insertChunk(db: DatabaseSync, text: string, id = "chunk-1"): void {
  db.prepare(
    `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line)` +
      ` VALUES (?, ?, 'memory.md', 'memory', 'fts-only', 1, 1)`,
  ).run(text, id);
}

async function runKeywordSearch(db: DatabaseSync, query: string) {
  return await searchKeyword({
    db,
    ftsTable: FTS_TABLE,
    providerModel: undefined,
    query,
    limit: 10,
    snippetMaxChars: 700,
    sourceFilter: { sql: "", params: [] },
    buildFtsQuery,
    bm25RankToScore,
    ftsTokenizer: "trigram",
  });
}

describe("searchKeyword trigram fallback", () => {
  const dbs: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of dbs) {
      db.close();
    }
    dbs.length = 0;
  });

  it("falls back to substring search for 2-char Chinese queries", async () => {
    const db = createTrigramDb();
    dbs.push(db);
    insertChunk(db, "之前讨论的那个方案");

    const results = await runKeywordSearch(db, "方案");

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("memory.md");
    expect(results[0]?.snippet).toContain("方案");
  });

  it("keeps long trigram terms and filters short CJK terms with LIKE", async () => {
    const db = createTrigramDb();
    dbs.push(db);
    insertChunk(db, "我们确认了 API 方案 和回滚步骤");
    insertChunk(db, "只有 API 没有短词", "chunk-2");

    const results = await runKeywordSearch(db, "API 方案");

    expect(results).toHaveLength(1);
    expect(results[0]?.snippet).toContain("API 方案");
  });

  it("falls back for short Japanese katakana terms in trigram mode", async () => {
    const db = createTrigramDb();
    dbs.push(db);
    insertChunk(db, "昨日話したバグ対応メモ");

    const results = await runKeywordSearch(db, "バグ");

    expect(results).toHaveLength(1);
    expect(results[0]?.snippet).toContain("バグ");
  });
});
