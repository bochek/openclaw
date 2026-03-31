import { createRequire } from "node:module";
import { installProcessWarningFilter } from "./warning-filter.js";

const require = createRequire(import.meta.url);

type BunSqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type BunSqliteDatabase = {
  close(): void;
  exec(sql: string): void;
  loadExtension?(path: string): void;
  prepare(sql: string): BunSqliteStatement;
};

type BunSqliteCtor = new (
  filename: string,
  options?: { create?: boolean; readonly?: boolean },
) => BunSqliteDatabase;

function loadBunSqlite(): typeof import("node:sqlite") {
  const bunSqlite = require("bun:sqlite") as { Database: BunSqliteCtor };

  class DatabaseSync {
    #allowExtension = false;
    #db: BunSqliteDatabase;

    constructor(pathname: string, options?: { allowExtension?: boolean; readOnly?: boolean }) {
      this.#allowExtension = options?.allowExtension ?? false;
      this.#db = new bunSqlite.Database(pathname, {
        create: !(options?.readOnly ?? false),
        readonly: options?.readOnly ?? false,
      });
    }

    close(): void {
      this.#db.close();
    }

    enableLoadExtension(allow: boolean): void {
      this.#allowExtension = allow;
    }

    exec(sql: string): void {
      this.#db.exec(sql);
    }

    loadExtension(pathname: string): void {
      if (!this.#allowExtension) {
        throw new Error("SQLite extension loading is disabled for this database handle.");
      }
      if (typeof this.#db.loadExtension !== "function") {
        throw new Error("SQLite extension loading is unavailable in this Bun runtime.");
      }
      this.#db.loadExtension(pathname);
    }

    prepare(sql: string): BunSqliteStatement {
      return this.#db.prepare(sql);
    }
  }

  return { DatabaseSync } as typeof import("node:sqlite");
}

export function requireNodeSqlite(): typeof import("node:sqlite") {
  installProcessWarningFilter();
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    if (typeof Bun !== "undefined") {
      try {
        return loadBunSqlite();
      } catch (bunErr) {
        const bunMessage = bunErr instanceof Error ? bunErr.message : String(bunErr);
        throw new Error(`SQLite support is unavailable in this Bun runtime. ${bunMessage}`, {
          cause: bunErr,
        });
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `SQLite support is unavailable in this Node runtime (missing node:sqlite). ${message}`,
      { cause: err },
    );
  }
}
