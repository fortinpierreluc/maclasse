import type { Furniture, FurnitureKind } from './types';
import { ROOM_H, ROOM_W } from './types';

export function furnitureSize(kind: FurnitureKind): { w: number; h: number } {
  switch (kind) {
    case 'pupitre':
      return { w: 108, h: 96 };
    case 'table2':
      return { w: 132, h: 200 };
    case 'table4':
      return { w: 292, h: 292 };
    case 'table6':
      return { w: 360, h: 210 };
    case 'bureau':
      return { w: 134, h: 74 };
    case 'porte':
      return { w: 14, h: 78 };
    case 'tableau':
      return { w: 480, h: 74 };
  }
}

export type SeatLocal = { x: number; y: number };

/** Offsets from the furniture center. Positive y is toward the bottom of the unrotated piece. */
export function seatLocals(kind: FurnitureKind): SeatLocal[] {
  switch (kind) {
    case 'pupitre':
      return [{ x: 0, y: 24 }];
    case 'table2':
      return [
        { x: 0, y: -70 },
        { x: 0, y: 70 },
      ];
    case 'table4':
      return [
        { x: 0, y: -108 },
        { x: 108, y: 0 },
        { x: 0, y: 108 },
        { x: -108, y: 0 },
      ];
    case 'table6':
      return [
        { x: -116, y: -74 },
        { x: 0, y: -74 },
        { x: 116, y: -74 },
        { x: -116, y: 74 },
        { x: 0, y: 74 },
        { x: 116, y: 74 },
      ];
    case 'bureau':
    case 'porte':
    case 'tableau':
      return [];
  }
}

export function localWorld(furniture: Furniture, local: SeatLocal): { x: number; y: number } {
  const rad = (furniture.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: furniture.x + local.x * cos - local.y * sin,
    y: furniture.y + local.x * sin + local.y * cos,
  };
}

export function seatWorld(furniture: Furniture, index: number): { x: number; y: number } | null {
  const local = seatLocals(furniture.kind)[index];
  if (!local) return null;
  return localWorld(furniture, local);
}

/** Where the first name sits on the desk, in front of that seat. */
export function labelLocal(kind: FurnitureKind, index: number): SeatLocal | null {
  const seat = seatLocals(kind)[index];
  if (!seat) return null;
  if (kind === 'pupitre') return { x: 0, y: -20 };
  if (kind === 'table2') return { x: 0, y: Math.sign(seat.y) * 26 };
  if (kind === 'table4') {
    if (Math.abs(seat.x) >= Math.abs(seat.y)) return { x: Math.sign(seat.x) * 52, y: 0 };
    return { x: 0, y: Math.sign(seat.y) * 52 };
  }
  if (kind === 'table6') return { x: seat.x, y: Math.sign(seat.y) * 28 };
  return { x: seat.x, y: seat.y };
}

export function labelWorld(furniture: Furniture, index: number): { x: number; y: number } | null {
  const local = labelLocal(furniture.kind, index);
  if (!local) return null;
  return localWorld(furniture, local);
}

export const CLOSE_DISTANCE = 210;

export function newId(): string {
  return crypto.randomUUID();
}

export function snap(value: number): number {
  return Math.round(value / 8) * 8;
}

/** Distance between desk centers when placing a row. */
export const ROW_GAP = 130;

/** Centers of a row, relative to the pointer. 90° and 270° run the row downward. */
export function rowOffsets(count: number, rotation: number): { x: number; y: number }[] {
  const vertical = rotation === 90 || rotation === 270;
  const start = -((count - 1) * ROW_GAP) / 2;
  return Array.from({ length: count }, (_, index) => {
    const along = start + index * ROW_GAP;
    return vertical ? { x: 0, y: along } : { x: along, y: 0 };
  });
}

const ROW_ALIGN = 20;
const ROW_GAP_MIN = 96;
const ROW_GAP_MAX = 190;

/** Desks that belong to the same row as the anchor, explicit group or a straight line. */
export function rowMates(furniture: Furniture[], anchorId: string): Furniture[] {
  const anchor = furniture.find((item) => item.id === anchorId);
  if (!anchor) return [];
  if (anchor.groupId) {
    const mates = furniture.filter((item) => item.groupId === anchor.groupId);
    return mates.length > 0 ? mates : [anchor];
  }
  if (anchor.kind !== 'pupitre') return [anchor];
  const vertical = anchor.rotation === 90 || anchor.rotation === 270;
  const pool = furniture
    .filter(
      (item) =>
        item.kind === 'pupitre' &&
        !item.groupId &&
        item.rotation === anchor.rotation &&
        Math.abs((vertical ? item.x : item.y) - (vertical ? anchor.x : anchor.y)) <= ROW_ALIGN,
    )
    .sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
  const chains: Furniture[][] = [];
  let chain: Furniture[] = [];
  for (const item of pool) {
    const previous = chain[chain.length - 1];
    const gap = previous ? (vertical ? item.y - previous.y : item.x - previous.x) : 0;
    if (!previous || (gap >= ROW_GAP_MIN && gap <= ROW_GAP_MAX)) chain.push(item);
    else {
      chains.push(chain);
      chain = [item];
    }
  }
  if (chain.length > 0) chains.push(chain);
  return chains.find((items) => items.some((item) => item.id === anchor.id)) ?? [anchor];
}

export function groupShift(items: Furniture[]): { x: number; y: number } {
  let minShiftX = -Infinity;
  let maxShiftX = Infinity;
  let minShiftY = -Infinity;
  let maxShiftY = Infinity;
  for (const item of items) {
    const { w, h } = furnitureSize(item.kind);
    const turned = item.rotation % 180 !== 0;
    const bw = turned ? h : w;
    const bh = turned ? w : h;
    const minX = bw / 2 + 8;
    const maxX = ROOM_W - bw / 2 - 8;
    const minY = bh / 2 + 8;
    const maxY = ROOM_H - bh / 2 - 8;
    minShiftX = Math.max(minShiftX, minX - item.x);
    maxShiftX = Math.min(maxShiftX, maxX - item.x);
    minShiftY = Math.max(minShiftY, minY - item.y);
    maxShiftY = Math.min(maxShiftY, maxY - item.y);
  }
  const pick = (min: number, max: number) => {
    if (min <= 0 && max >= 0) return 0;
    if (min <= max) return min > 0 ? min : max;
    return (min + max) / 2;
  };
  return { x: pick(minShiftX, maxShiftX), y: pick(minShiftY, maxShiftY) };
}

/** Moves a whole row with the anchor. Returns null when nothing changes. */
export function applyGroupMove(
  furniture: Furniture[],
  anchorId: string,
  next: { x: number; y: number; rotation: number },
): Furniture[] | null {
  const anchor = furniture.find((item) => item.id === anchorId);
  if (!anchor) return null;
  const mates = rowMates(furniture, anchorId);
  const groupId = mates.length > 1 ? (anchor.groupId ?? newId()) : anchor.groupId;
  const rotationDelta = (((next.rotation - anchor.rotation) % 360) + 360) % 360;
  const dx = next.x - anchor.x;
  const dy = next.y - anchor.y;
  let moved = mates.map((item) => ({
    ...item,
    x: item.x + dx,
    y: item.y + dy,
    rotation: (((item.rotation + rotationDelta) % 360) + 360) % 360,
    ...(groupId ? { groupId } : {}),
  }));
  const shift = groupShift(moved);
  moved = moved.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
  const same = moved.every((item) => {
    const previous = mates.find((mate) => mate.id === item.id);
    return (
      previous &&
      previous.x === item.x &&
      previous.y === item.y &&
      previous.rotation === item.rotation &&
      previous.groupId === item.groupId
    );
  });
  if (same) return null;
  const byId = new Map(moved.map((item) => [item.id, item]));
  return furniture.map((item) => byId.get(item.id) ?? item);
}

export function groupGhostParts(
  furniture: Furniture[],
  anchorId: string,
  rotation: number,
): { dx: number; dy: number; rotation: number; kind: Furniture['kind'] }[] {
  const anchor = furniture.find((item) => item.id === anchorId);
  if (!anchor) return [];
  const mates = rowMates(furniture, anchorId);
  const rotationDelta = (((rotation - anchor.rotation) % 360) + 360) % 360;
  return mates.map((item) => ({
    dx: item.x - anchor.x,
    dy: item.y - anchor.y,
    rotation: (((item.rotation + rotationDelta) % 360) + 360) % 360,
    kind: item.kind,
  }));
}

export function clampFurniture(furniture: Furniture): Furniture {
  const { w, h } = furnitureSize(furniture.kind);
  const turned = furniture.rotation % 180 !== 0;
  const bw = turned ? h : w;
  const bh = turned ? w : h;
  const minX = bw / 2 + 8;
  const maxX = ROOM_W - bw / 2 - 8;
  const minY = bh / 2 + 8;
  const maxY = ROOM_H - bh / 2 - 8;
  return {
    ...furniture,
    x: Math.min(maxX, Math.max(minX, furniture.x)),
    y: Math.min(maxY, Math.max(minY, furniture.y)),
  };
}

export function facingLabel(rotation: number): string {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 0) return 'vers le haut';
  if (r === 90) return 'vers la droite';
  if (r === 180) return 'vers le bas';
  if (r === 270) return 'vers la gauche';
  return `${r}°`;
}

export function shortGrade(grade: string): string {
  if (!grade) return '';
  if (grade.startsWith('Secondaire')) return grade.replace('Secondaire ', 'Sec. ');
  if (grade === 'Préscolaire') return 'Présco.';
  return grade.replace(' année', '');
}

export function ensureRoomFixtures<T extends { furniture: Furniture[]; updatedAt: string }>(room: T): T {
  const hasBoard = room.furniture.some((item) => item.kind === 'tableau');
  const hasDoor = room.furniture.some((item) => item.kind === 'porte');
  if (hasBoard && hasDoor) return room;
  const extra: Furniture[] = [];
  if (!hasBoard) extra.push(clampFurniture({ id: newId(), kind: 'tableau', x: ROOM_W / 2, y: 58, rotation: 0 }));
  if (!hasDoor) extra.push(clampFurniture({ id: newId(), kind: 'porte', x: 28, y: ROOM_H / 2, rotation: 0 }));
  return { ...room, furniture: [...extra, ...room.furniture], updatedAt: new Date().toISOString() };
}
