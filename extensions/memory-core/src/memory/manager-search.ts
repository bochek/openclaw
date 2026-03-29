import type { DatabaseSync } from "node:sqlite";
import { truncateUtf16Safe } from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import {
  cosineSimilarity,
  parseEmbedding,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

export type SearchSource = string;

export type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

export async function searchVector(params: {
  db: DatabaseSync;
  vectorTable: string;
  providerModel: string;
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  ensureVectorReady: (dimensions: number) => Promise<boolean>;
  sourceFilterVec: { sql: string; params: SearchSource[] };
  sourceFilterChunks: { sql: string; params: SearchSource[] };
}): Promise<SearchRowResult[]> {
  if (params.queryVec.length === 0 || params.limit <= 0) {
    return [];
  }
  if (await params.ensureVectorReady(params.queryVec.length)) {
    const rows = params.db
      .prepare(
        `SELECT c.id, c.path, c.start_line, c.end_line, c.text,\n` +
          `       c.source,\n` +
          `       vec_distance_cosine(v.embedding, ?) AS dist\n` +
          `  FROM ${params.vectorTable} v\n` +
          `  JOIN chunks c ON c.id = v.id\n` +
          ` WHERE c.model = ?${params.sourceFilterVec.sql}\n` +
          ` ORDER BY dist ASC\n` +
          ` LIMIT ?`,
      )
      .all(
        vectorToBlob(params.queryVec),
        params.providerModel,
        ...params.sourceFilterVec.params,
        params.limit,
      ) as Array<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      source: SearchSource;
      dist: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: 1 - row.dist,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    }));
  }

  const candidates = listChunks({
    db: params.db,
    providerModel: params.providerModel,
    sourceFilter: params.sourceFilterChunks,
  });
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(params.queryVec, chunk.embedding),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  return scored
    .toSorted((a, b) => b.score - a.score)
    .slice(0, params.limit)
    .map((entry) => ({
      id: entry.chunk.id,
      path: entry.chunk.path,
      startLine: entry.chunk.startLine,
      endLine: entry.chunk.endLine,
      score: entry.score,
      snippet: truncateUtf16Safe(entry.chunk.text, params.snippetMaxChars),
      source: entry.chunk.source,
    }));
}

export function listChunks(params: {
  db: DatabaseSync;
  providerModel: string;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
  source: SearchSource;
}> {
  const rows = params.db
    .prepare(
      `SELECT id, path, start_line, end_line, text, embedding, source\n` +
        `  FROM chunks\n` +
        ` WHERE model = ?${params.sourceFilter.sql}`,
    )
    .all(params.providerModel, ...params.sourceFilter.params) as Array<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: string;
    source: SearchSource;
  }>;

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
    source: row.source,
  }));
}

const QUERY_TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const CJK_QUERY_TOKEN_RE = /[\u3400-\u9fff\u3040-\u30ff\u3131-\u3163\uac00-\ud7af]/u;

function splitTrigramQueryTokens(raw: string): { matchTokens: string[]; likeTokens: string[] } {
  const tokens =
    raw
      .match(QUERY_TOKEN_RE)
      ?.map((token) => token.trim())
      .filter(Boolean) ?? [];
  const matchTokens: string[] = [];
  const likeTokens: string[] = [];
  for (const token of tokens) {
    const codePointLength = Array.from(token).length;
    if (codePointLength < 3 && CJK_QUERY_TOKEN_RE.test(token)) {
      likeTokens.push(token);
    } else {
      matchTokens.push(token);
    }
  }
  return { matchTokens, likeTokens };
}

function escapeLikePattern(token: string): string {
  return token.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchKeyword(params: {
  db: DatabaseSync;
  ftsTable: string;
  providerModel: string | undefined;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
  buildFtsQuery: (raw: string) => string | null;
  bm25RankToScore: (rank: number) => number;
  ftsTokenizer?: "unicode61" | "trigram";
}): Promise<Array<SearchRowResult & { textScore: number }>> {
  if (params.limit <= 0) {
    return [];
  }

  const { matchTokens, likeTokens } =
    params.ftsTokenizer === "trigram"
      ? splitTrigramQueryTokens(params.query)
      : { matchTokens: [], likeTokens: [] };
  const matchQuerySource = params.ftsTokenizer === "trigram" ? matchTokens.join(" ") : params.query;
  const ftsQuery = params.buildFtsQuery(matchQuerySource);
  const useMatch = Boolean(ftsQuery);
  if (!useMatch && likeTokens.length === 0) {
    return [];
  }

  // When providerModel is undefined (FTS-only mode), search all models
  const modelClause = params.providerModel ? " AND model = ?" : "";
  const modelParams = params.providerModel ? [params.providerModel] : [];
  const likeClause =
    likeTokens.length > 0 ? likeTokens.map(() => ` AND text LIKE ? ESCAPE '\\'`).join("") : "";
  const likeParams = likeTokens.map((token) => `%${escapeLikePattern(token)}%`);
  const rankSelect = useMatch ? `bm25(${params.ftsTable}) AS rank` : `0 AS rank`;
  const whereClause = useMatch ? `${params.ftsTable} MATCH ?` : "1 = 1";
  const queryParams = useMatch ? [ftsQuery] : [];

  const rows = params.db
    .prepare(
      `SELECT id, path, source, start_line, end_line, text,\n` +
        `       ${rankSelect}\n` +
        `  FROM ${params.ftsTable}\n` +
        ` WHERE ${whereClause}${modelClause}${params.sourceFilter.sql}${likeClause}\n` +
        ` ORDER BY rank ASC, rowid DESC\n` +
        ` LIMIT ?`,
    )
    .all(
      ...queryParams,
      ...modelParams,
      ...params.sourceFilter.params,
      ...likeParams,
      params.limit,
    ) as Array<{
    id: string;
    path: string;
    source: SearchSource;
    start_line: number;
    end_line: number;
    text: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const textScore = params.bm25RankToScore(row.rank);
    return {
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    };
  });
}
