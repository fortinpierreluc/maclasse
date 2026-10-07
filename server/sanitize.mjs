const SEATS = { pupitre: 1, table2: 2, table4: 4, table6: 6, bureau: 0, porte: 0, tableau: 0 };
const GENDERS = new Set(['fille', 'gars', 'na']);
const KINDS = new Set(Object.keys(SEATS));
const ROTATIONS = new Set([0, 90, 180, 270]);

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function idList(value, allowed) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const id = text(item, 80);
    if (!id || !allowed.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function sanitizeClassroom(body) {
  if (!body || typeof body !== 'object') return null;
  const name = text(body.name, 80) || 'Sans nom';

  const rawStudents = Array.isArray(body.students) ? body.students.slice(0, 80) : [];
  const students = [];
  const ids = new Set();
  for (const raw of rawStudents) {
    if (!raw || typeof raw !== 'object') continue;
    const id = text(raw.id, 80);
    const firstName = text(raw.firstName, 60);
    const lastName = text(raw.lastName, 60);
    if (!id || ids.has(id) || (!firstName && !lastName)) continue;
    ids.add(id);
    students.push({
      id,
      number: text(raw.number, 12),
      firstName,
      lastName,
      gender: GENDERS.has(raw.gender) ? raw.gender : 'na',
      grade: text(raw.grade, 40),
      friendIds: Array.isArray(raw.friendIds) ? raw.friendIds : [],
      avoidIds: Array.isArray(raw.avoidIds) ? raw.avoidIds : [],
    });
  }

  for (const student of students) {
    const others = new Set([...ids].filter((id) => id !== student.id));
    const avoidIds = idList(student.avoidIds, others);
    const avoid = new Set(avoidIds);
    const friendIds = idList(student.friendIds, others).filter((id) => !avoid.has(id));
    student.friendIds = friendIds;
    student.avoidIds = avoidIds;
  }

  const rawFurniture = Array.isArray(body.furniture) ? body.furniture.slice(0, 120) : [];
  const furniture = [];
  const furnitureIds = new Set();
  for (const raw of rawFurniture) {
    if (!raw || typeof raw !== 'object') continue;
    const id = text(raw.id, 80);
    if (!id || furnitureIds.has(id) || !KINDS.has(raw.kind)) continue;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    furnitureIds.add(id);
    const groupId = text(raw.groupId, 80);
    furniture.push({
      id,
      kind: raw.kind,
      x: Math.min(4000, Math.max(-500, x)),
      y: Math.min(4000, Math.max(-500, y)),
      rotation: ROTATIONS.has(raw.rotation) ? raw.rotation : 0,
      ...(groupId ? { groupId } : {}),
    });
  }

  const byFurniture = new Map(furniture.map((item) => [item.id, item]));
  const rawPlacements = Array.isArray(body.placements) ? body.placements.slice(0, 200) : [];
  const placements = [];
  const seated = new Set();
  const taken = new Set();
  for (const raw of rawPlacements) {
    if (!raw || typeof raw !== 'object') continue;
    const studentId = text(raw.studentId, 80);
    const furnitureId = text(raw.furnitureId, 80);
    const seatIndex = raw.seatIndex;
    const item = byFurniture.get(furnitureId);
    if (!item || !ids.has(studentId) || seated.has(studentId)) continue;
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEATS[item.kind]) continue;
    const seatKey = `${furnitureId}:${seatIndex}`;
    if (taken.has(seatKey)) continue;
    seated.add(studentId);
    taken.add(seatKey);
    placements.push({ studentId, furnitureId, seatIndex });
  }

  return { name, students, furniture, placements };
}

const WORDS = [
  'tilleul',
  'miel',
  'sauge',
  'lin',
  'ambre',
  'noyer',
  'cacao',
  'papier',
  'encre',
  'laine',
  'brume',
  'ardoise',
  'noisette',
  'prairie',
  'nid',
  'cahier',
  'biscuit',
  'theiere',
  'couverture',
  'atelier',
];

export function makeCode(exists) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const n = Math.floor(1000 + Math.random() * 9000);
    const code = `${word}-${n}`;
    if (!exists(code)) return code;
  }
  return `nid-${Date.now().toString(36)}`;
}

export function normalizeCode(value) {
  return text(value, 40).toLowerCase();
}
