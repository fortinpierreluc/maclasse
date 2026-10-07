import fs from 'node:fs';
import path from 'node:path';

/**
 * Base locale des plans de classe.
 * SQLite (node:sqlite) quand le runtime le permet, sinon un fichier JSON.
 */
export async function openStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return openSqlite(DatabaseSync, dbPath);
  } catch (error) {
    console.warn('SQLite indisponible, repli sur un fichier JSON.', error instanceof Error ? error.message : error);
    return openJson(dbPath.replace(/\.db$/i, '.json'));
  }
}

function openSqlite(DatabaseSync, dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS classrooms (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(
    `INSERT INTO classrooms (code, name, payload, updated_at) VALUES (?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE classrooms SET name = ?, payload = ?, updated_at = ? WHERE code = ?`,
  );
  const getStmt = db.prepare(
    `SELECT code, name, payload, updated_at FROM classrooms WHERE code = ?`,
  );
  const listStmt = db.prepare(
    `SELECT code, name, updated_at FROM classrooms ORDER BY updated_at DESC LIMIT 40`,
  );
  const removeStmt = db.prepare(`DELETE FROM classrooms WHERE code = ?`);

  return {
    driver: 'sqlite',
    file: dbPath,
    get(code) {
      return getStmt.get(code) ?? null;
    },
    list() {
      return listStmt.all();
    },
    insert(row) {
      insert.run(row.code, row.name, row.payload, row.updated_at);
    },
    update(row) {
      update.run(row.name, row.payload, row.updated_at, row.code);
    },
    remove(code) {
      removeStmt.run(code);
    },
  };
}

function openJson(file) {
  function read() {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !data.classes) return { classes: {} };
      return data;
    } catch {
      return { classes: {} };
    }
  }
  function write(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return {
    driver: 'json',
    file,
    get(code) {
      return read().classes[code] ?? null;
    },
    list() {
      return Object.values(read().classes).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 40);
    },
    insert(row) {
      const data = read();
      data.classes[row.code] = row;
      write(data);
    },
    update(row) {
      const data = read();
      if (!data.classes[row.code]) return;
      data.classes[row.code] = row;
      write(data);
    },
    remove(code) {
      const data = read();
      delete data.classes[code];
      write(data);
    },
  };
}
