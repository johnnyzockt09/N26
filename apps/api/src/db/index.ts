import { Database } from './database.js';
import { SqliteDatabase } from './sqlite.js';
import { PostgresDatabase } from './postgres.js';

export type { Database };

export interface AppDatabase {
  db: Database;
  close(): Promise<void>;
}

export function initDatabase(url: string): AppDatabase {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pg = new PostgresDatabase(url);
    return {
      db: pg,
      close: () => pg.close(),
    };
  }
  const sqlite = new SqliteDatabase(url.replace(/^sqlite:/, ''));
  return {
    db: sqlite,
    close: () => {
      sqlite.close();
      return Promise.resolve();
    },
  };
}