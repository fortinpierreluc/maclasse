import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { makeCode, normalizeCode, sanitizeClassroom } from './sanitize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data');
const dbPath = path.join(dataDir, 'nid.db');
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';

const store = await openStore(dbPath);
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));

function readRow(row) {
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload);
    return { ...payload, code: row.code, name: row.name, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, driver: store.driver });
});

app.get('/api/classes', (_req, res) => {
  const classes = store.list().map((row) => ({
    code: row.code,
    name: row.name,
    updatedAt: row.updated_at,
  }));
  res.json({ classes });
});

app.get('/api/classes/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  const classroom = readRow(store.get(code));
  if (!classroom) return res.status(404).json({ error: 'Aucun plan avec ce code.' });
  res.json(classroom);
});

app.post('/api/classes', (req, res) => {
  const data = sanitizeClassroom(req.body);
  if (!data) return res.status(400).json({ error: 'Plan invalide.' });
  const code = makeCode((candidate) => Boolean(store.get(candidate)));
  const updatedAt = new Date().toISOString();
  const classroom = { ...data, code, updatedAt };
  store.insert({
    code,
    name: classroom.name,
    payload: JSON.stringify(classroom),
    updated_at: updatedAt,
  });
  res.status(201).json(classroom);
});

app.put('/api/classes/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  const existing = store.get(code);
  if (!existing) return res.status(404).json({ error: 'Aucun plan avec ce code.' });
  const incomingStamp = typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : '';
  if (incomingStamp && existing.updated_at > incomingStamp) {
    return res.status(409).json({ error: 'Une version plus récente est déjà enregistrée.' });
  }
  const data = sanitizeClassroom(req.body);
  if (!data) return res.status(400).json({ error: 'Plan invalide.' });
  const updatedAt = incomingStamp || new Date().toISOString();
  const classroom = { ...data, code, updatedAt };
  store.update({
    code,
    name: classroom.name,
    payload: JSON.stringify(classroom),
    updated_at: updatedAt,
  });
  res.json(classroom);
});

app.delete('/api/classes/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  if (!store.get(code)) return res.status(404).json({ error: 'Aucun plan avec ce code.' });
  store.remove(code);
  res.json({ ok: true });
});

const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(port, host, () => {
  const base = store.driver === 'sqlite' ? 'SQLite' : 'fichier JSON';
  console.log(`Ma Classe · base ${base} · http://${host}:${port}`);
});
