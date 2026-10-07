import { CLOSE_DISTANCE, seatWorld } from './geometry';
import type { Classroom, Placement, Student } from './types';

export type PairLink = {
  a: string;
  b: string;
  kind: 'friend' | 'avoid';
  close: boolean;
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

export function displayName(student: Student): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function sameFirstName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'fr', { sensitivity: 'accent' }) === 0;
}

/** Prénom sur le bureau. Initiale du nom seulement si un autre élève a le même prénom. */
export function deskName(student: Student, students: Student[]): string {
  const first = student.firstName.trim();
  if (!first) return student.lastName.trim();
  const duplicates = students.filter((item) => sameFirstName(item.firstName, first));
  if (duplicates.length < 2) return first;
  const initial = student.lastName.trim().charAt(0).toLocaleUpperCase('fr');
  return initial ? `${first} ${initial}.` : first;
}

export function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const na = Number.parseInt(a.number, 10);
    const nb = Number.parseInt(b.number, 10);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum && na !== nb) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return displayName(a).localeCompare(displayName(b), 'fr');
  });
}

export function nextNumber(students: Student[]): string {
  const nums = students.map((student) => Number.parseInt(student.number, 10)).filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1);
}

export function majorityGrade(students: Student[]): string | null {
  const counts = new Map<string, number>();
  for (const student of students) {
    if (!student.grade) continue;
    counts.set(student.grade, (counts.get(student.grade) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [grade, count] of counts) {
    if (count > bestCount) {
      best = grade;
      bestCount = count;
    }
  }
  return best;
}

function relationBetween(a: Student, b: Student): 'friend' | 'avoid' | null {
  if (a.avoidIds.includes(b.id) || b.avoidIds.includes(a.id)) return 'avoid';
  if (a.friendIds.includes(b.id) || b.friendIds.includes(a.id)) return 'friend';
  return null;
}

export function pairLinks(classroom: Classroom): PairLink[] {
  const furniture = new Map(classroom.furniture.map((item) => [item.id, item]));
  const points: { studentId: string; furnitureId: string; x: number; y: number }[] = [];
  for (const placement of classroom.placements) {
    const item = furniture.get(placement.furnitureId);
    if (!item) continue;
    const pos = seatWorld(item, placement.seatIndex);
    if (!pos) continue;
    points.push({ studentId: placement.studentId, furnitureId: placement.furnitureId, ...pos });
  }

  const students = new Map(classroom.students.map((student) => [student.id, student]));
  const links: PairLink[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const left = points[i];
      const right = points[j];
      const studentA = students.get(left.studentId);
      const studentB = students.get(right.studentId);
      if (!studentA || !studentB) continue;
      const kind = relationBetween(studentA, studentB);
      if (!kind) continue;
      const distance = Math.hypot(left.x - right.x, left.y - right.y);
      const close = left.furnitureId === right.furnitureId || distance <= CLOSE_DISTANCE;
      links.push({
        a: studentA.id,
        b: studentB.id,
        kind,
        close,
        ax: left.x,
        ay: left.y,
        bx: right.x,
        by: right.y,
      });
    }
  }
  return links;
}

export function moveStudent(
  placements: Placement[],
  studentId: string,
  target: { furnitureId: string; seatIndex: number } | null,
): Placement[] {
  const current = placements.find((placement) => placement.studentId === studentId) ?? null;
  let next = placements.filter((placement) => placement.studentId !== studentId);
  if (!target) return next;

  const occupied = next.find(
    (placement) => placement.furnitureId === target.furnitureId && placement.seatIndex === target.seatIndex,
  );
  if (occupied && current) {
    next = next.map((placement) =>
      placement.studentId === occupied.studentId
        ? { ...placement, furnitureId: current.furnitureId, seatIndex: current.seatIndex }
        : placement,
    );
  } else if (occupied) {
    next = next.filter((placement) => placement.studentId !== occupied.studentId);
  }
  next.push({ studentId, furnitureId: target.furnitureId, seatIndex: target.seatIndex });
  return next;
}

export function mirrorRelations(students: Student[], draft: Student): Student[] {
  const friend = new Set(draft.friendIds.filter((id) => id !== draft.id && !draft.avoidIds.includes(id)));
  const avoid = new Set(draft.avoidIds.filter((id) => id !== draft.id));
  for (const id of avoid) friend.delete(id);
  const cleaned: Student = { ...draft, friendIds: [...friend], avoidIds: [...avoid] };

  const exists = students.some((student) => student.id === cleaned.id);
  const base = exists ? students.map((student) => (student.id === cleaned.id ? cleaned : student)) : [...students, cleaned];

  return base.map((student) => {
    if (student.id === cleaned.id) return cleaned;
    const friendIds = student.friendIds.filter((id) => id !== cleaned.id);
    const avoidIds = student.avoidIds.filter((id) => id !== cleaned.id);
    if (cleaned.friendIds.includes(student.id)) friendIds.push(cleaned.id);
    if (cleaned.avoidIds.includes(student.id)) avoidIds.push(cleaned.id);
    return { ...student, friendIds, avoidIds };
  });
}

export function removeStudent(students: Student[], placements: Placement[], id: string): { students: Student[]; placements: Placement[] } {
  return {
    students: students
      .filter((student) => student.id !== id)
      .map((student) => ({
        ...student,
        friendIds: student.friendIds.filter((friendId) => friendId !== id),
        avoidIds: student.avoidIds.filter((avoidId) => avoidId !== id),
      })),
    placements: placements.filter((placement) => placement.studentId !== id),
  };
}

export function foldSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
