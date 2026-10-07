import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ApiError, createClass, deleteClass, saveClass } from '../api';
import { ROW_GAP, applyGroupMove, clampFurniture, ensureRoomFixtures, facingLabel, furnitureSize, groupGhostParts, groupShift, labelWorld, newId, rowMates, seatLocals, seatWorld, snap } from '../geometry';
import { majorityGrade, mirrorRelations, moveStudent, nextNumber, pairLinks, removeStudent } from '../relations';
import type { Classroom, Furniture, FurnitureKind, Student, Tool } from '../types';
import { FURNITURE_LABEL, ROOM_H, ROOM_W } from '../types';
import { Chip } from './Chip';
import { AppleMark, IconBoard, IconBureau, IconDesk, IconDoor, IconRow, IconSelect, IconTable } from './Icons';
import { RoomCanvas } from './RoomCanvas';
import { StudentDialog } from './StudentDialog';
import { StudentDrawer } from './StudentDrawer';

type HotSeat = { furnitureId: string; seatIndex: number } | null;

type StudentDrag = {
  studentId: string;
  x: number;
  y: number;
  hot: HotSeat;
  overDrawer: boolean;
};

type Carry = {
  id: string;
  rotation: number;
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
  moved: boolean;
  sticky: boolean;
};

const TOOLS: { id: Tool; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Choisir', hint: 'Sélectionner et déplacer', icon: <IconSelect /> },
  { id: 'pupitre', label: 'Pupitre', hint: 'Un siège', icon: <IconDesk /> },
  { id: 'table2', label: 'Table 2', hint: 'Deux places face à face', icon: <IconTable /> },
  { id: 'table4', label: 'Table 4', hint: 'Îlot de quatre', icon: <IconTable /> },
  { id: 'table6', label: 'Table 6', hint: 'Grande table', icon: <IconTable /> },
  { id: 'bureau', label: 'Bureau', hint: 'Bureau du prof', icon: <IconBureau /> },
  { id: 'porte', label: 'Porte', hint: 'Porte de la classe', icon: <IconDoor /> },
  { id: 'tableau', label: 'Tableau', hint: 'Tableau à placer', icon: <IconBoard /> },
  { id: 'row', label: 'Rangée', hint: 'Plusieurs pupitres d’un coup', icon: <IconRow /> },
];

function blankStudent(students: Student[]): Student {
  return {
    id: newId(),
    number: nextNumber(students),
    firstName: '',
    lastName: '',
    gender: 'na',
    grade: majorityGrade(students) ?? '',
    friendIds: [],
    avoidIds: [],
  };
}

export function Editor({
  initial,
  driver,
  onOpen,
  onExit,
}: {
  initial: Classroom;
  driver: string;
  onOpen: (classroom: Classroom) => void;
  onExit: () => void;
}) {
  const [classroom, setClassroom] = useState(() => ensureRoomFixtures(initial));
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(4);
  const [linkMode, setLinkMode] = useState<'proches' | 'tous'>('proches');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [drag, setDrag] = useState<StudentDrag | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [past, setPast] = useState<Classroom[]>([]);
  const [future, setFuture] = useState<Classroom[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | 'conflict'>('saved');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const classroomRef = useRef(classroom);
  classroomRef.current = classroom;
  const roomRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;
  const lastSaved = useRef(initial.updatedAt);
  const snapshotRef = useRef<Classroom | null>(null);
  const dialogRef = useRef(false);
  dialogRef.current = editing !== null;
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef(0);
  const rowCountRef = useRef(rowCount);
  rowCountRef.current = rowCount;
  const carryRef = useRef<Carry | null>(null);
  const previewRotationRef = useRef(0);
  const onStickyMove = useRef((event: PointerEvent) => {
    const current = carryRef.current;
    if (!current?.sticky) return;
    const next = { ...current, clientX: event.clientX, clientY: event.clientY };
    carryRef.current = next;
    setCarry(next);
  }).current;
  const cancelCarryRef = useRef<() => void>(() => {});
  const onOutsidePointerDown = useRef((event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.room, [data-rotate], [data-keep-carry]')) return;
    cancelCarryRef.current();
  }).current;
  const actionsRef = useRef({
    escape: () => {},
    rotate: (_direction: 1 | -1) => {},
    remove: () => {},
    undo: () => {},
    redo: () => {},
    duplicate: () => {},
    nudge: (_dx: number, _dy: number) => {},
  });

  const links = useMemo(() => pairLinks(classroom), [classroom]);
  const selected = classroom.furniture.find((item) => item.id === selectedId) ?? null;
  const closeConflicts = links.filter((link) => link.kind === 'avoid' && link.close).length;
  const closeFriends = links.filter((link) => link.kind === 'friend' && link.close).length;
  const seatedCount = classroom.placements.length;

  function flash(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  function commitFrom(previous: Classroom, next: Classroom) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    pastRef.current = [...pastRef.current.slice(-49), previous];
    futureRef.current = [];
    setPast(pastRef.current);
    setFuture([]);
    classroomRef.current = stamped;
    setClassroom(stamped);
  }

  function undo() {
    const previous = pastRef.current[pastRef.current.length - 1];
    if (!previous) return;
    const current = classroomRef.current;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [current, ...futureRef.current].slice(0, 50);
    setPast(pastRef.current);
    setFuture(futureRef.current);
    const stamped = { ...previous, updatedAt: new Date().toISOString() };
    classroomRef.current = stamped;
    setClassroom(stamped);
  }

  function redo() {
    const next = futureRef.current[0];
    if (!next) return;
    const current = classroomRef.current;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-49), current];
    setPast(pastRef.current);
    setFuture(futureRef.current);
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    classroomRef.current = stamped;
    setClassroom(stamped);
  }

  function rename(name: string) {
    const current = classroomRef.current;
    const next = { ...current, name: name.slice(0, 80), updatedAt: new Date().toISOString() };
    classroomRef.current = next;
    setClassroom(next);
  }

  function toRoom(event: { clientX: number; clientY: number }) {
    const rect = roomRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: ROOM_W / 2, y: ROOM_H / 2 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * ROOM_W,
      y: ((event.clientY - rect.top) / rect.height) * ROOM_H,
    };
  }

  function place(kind: FurnitureKind, x: number, y: number) {
    const current = classroomRef.current;
    const piece = clampFurniture({
      id: newId(),
      kind,
      x: snap(x),
      y: snap(y),
      rotation: previewRotationRef.current,
    });
    commitFrom(current, { ...current, furniture: [...current.furniture, piece] });
  }

  function placeRow(x: number, y: number) {
    const count = rowCountRef.current;
    const rotation = previewRotationRef.current;
    const vertical = rotation === 90 || rotation === 270;
    const size = furnitureSize('pupitre');
    const span = vertical ? size.h : size.w;
    const total = (count - 1) * ROW_GAP;
    const limit = vertical ? ROOM_H : ROOM_W;
    const min = span / 2 + 8;
    const max = limit - span / 2 - 8;
    let start = snap(vertical ? y : x) - total / 2;
    if (start < min) start = min;
    if (start + total > max) start = Math.max(min, max - total);
    const current = classroomRef.current;
    const groupId = newId();
    const pieces: Furniture[] = [];
    for (let index = 0; index < count; index += 1) {
      const along = start + index * ROW_GAP;
      pieces.push({
        id: newId(),
        groupId,
        kind: 'pupitre',
        x: vertical ? snap(x) : along,
        y: vertical ? along : snap(y),
        rotation,
      });
    }
    const shift = groupShift(pieces);
    const placed = pieces.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
    commitFrom(current, { ...current, furniture: [...current.furniture, ...placed] });
  }

  function rotateSelected(direction: 1 | -1) {
    const id = selectedRef.current;
    if (!id) return;
    const current = classroomRef.current;
    const anchor = current.furniture.find((item) => item.id === id);
    if (!anchor) return;
    const furniture = applyGroupMove(current.furniture, id, {
      x: anchor.x,
      y: anchor.y,
      rotation: (anchor.rotation + direction * 90 + 360) % 360,
    });
    if (!furniture) return;
    commitFrom(current, { ...current, furniture });
  }

  function nudge(dx: number, dy: number) {
    const id = selectedRef.current;
    if (!id) return;
    const current = classroomRef.current;
    const anchor = current.furniture.find((item) => item.id === id);
    if (!anchor) return;
    const furniture = applyGroupMove(current.furniture, id, {
      x: snap(anchor.x + dx),
      y: snap(anchor.y + dy),
      rotation: anchor.rotation,
    });
    if (!furniture) return;
    commitFrom(current, { ...current, furniture });
  }

  function deleteSelected() {
    cancelCarry();
    const id = selectedRef.current;
    if (!id) return;
    const current = classroomRef.current;
    commitFrom(current, {
      ...current,
      furniture: current.furniture.filter((item) => item.id !== id),
      placements: current.placements.filter((placement) => placement.furnitureId !== id),
    });
    setSelectedId(null);
  }

  function unseatSelected() {
    const id = selectedRef.current;
    if (!id) return;
    const current = classroomRef.current;
    if (!current.placements.some((placement) => placement.furnitureId === id)) return;
    commitFrom(current, {
      ...current,
      placements: current.placements.filter((placement) => placement.furnitureId !== id),
    });
  }

  function cancelCarry() {
    window.removeEventListener('pointermove', onStickyMove);
    window.removeEventListener('pointerdown', onOutsidePointerDown, true);
    if (!carryRef.current) return;
    carryRef.current = null;
    setCarry(null);
  }
  cancelCarryRef.current = cancelCarry;

  function rotateCarry(direction: 1 | -1) {
    const current = carryRef.current;
    if (!current) return;
    const next = { ...current, rotation: (current.rotation + direction * 90 + 360) % 360 };
    carryRef.current = next;
    setCarry(next);
  }

  function rotatePreview(direction: 1 | -1) {
    const rotation = (previewRotationRef.current + direction * 90 + 360) % 360;
    previewRotationRef.current = rotation;
    setPreviewRotation(rotation);
  }

  function rotateActive(direction: 1 | -1) {
    if (carryRef.current) {
      rotateCarry(direction);
      return;
    }
    if (toolRef.current !== 'select') {
      rotatePreview(direction);
      return;
    }
    rotateSelected(direction);
  }

  function dropCarry(clientX: number, clientY: number) {
    const current = carryRef.current;
    if (!current) return;
    window.removeEventListener('pointermove', onStickyMove);
    window.removeEventListener('pointerdown', onOutsidePointerDown, true);
    carryRef.current = null;
    setCarry(null);
    const point = toRoom({ clientX, clientY });
    const room = classroomRef.current;
    const before = room.furniture.find((item) => item.id === current.id);
    if (!before) return;
    const furniture = applyGroupMove(room.furniture, current.id, {
      x: snap(point.x),
      y: snap(point.y),
      rotation: current.rotation,
    });
    if (!furniture) return;
    commitFrom(room, { ...room, furniture });
  }

  function armSticky(current: Carry) {
    const sticky = { ...current, sticky: true };
    carryRef.current = sticky;
    setCarry(sticky);
    window.addEventListener('pointermove', onStickyMove);
    window.addEventListener('pointerdown', onOutsidePointerDown, true);
  }

  function pickup(furniture: Furniture, clientX: number, clientY: number) {
    const next: Carry = {
      id: furniture.id,
      rotation: furniture.rotation,
      clientX,
      clientY,
      originX: clientX,
      originY: clientY,
      moved: false,
      sticky: false,
    };
    carryRef.current = next;
    setCarry(next);
    setSelectedId(furniture.id);
    const move = (event: PointerEvent) => {
      const current = carryRef.current;
      if (!current || current.sticky || current.id !== furniture.id) return;
      const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 8;
      const updated = { ...current, clientX: event.clientX, clientY: event.clientY, moved };
      carryRef.current = updated;
      setCarry(updated);
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const current = carryRef.current;
      if (!current || current.id !== furniture.id || current.sticky) return;
      const target = event.target instanceof Element ? event.target : null;
      const keep = Boolean(target?.closest('[data-keep-carry]'));
      if (keep || !current.moved) armSticky({ ...current, clientX: event.clientX, clientY: event.clientY });
      else dropCarry(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function selectTool(next: Tool, clientX: number, clientY: number) {
    if (next !== toolRef.current) {
      const rotation = next === 'bureau' ? 180 : 0;
      previewRotationRef.current = rotation;
      setPreviewRotation(rotation);
    }
    if (next !== 'select') cancelCarry();
    setTool(next);
    setPointer({ x: clientX, y: clientY });
  }

  function duplicateSelected() {
    const id = selectedRef.current;
    if (!id) return;
    const current = classroomRef.current;
    const mates = rowMates(current.furniture, id);
    if (mates.length === 0) return;
    const groupId = mates.length > 1 ? newId() : undefined;
    let copies = mates.map((source) => ({
      ...source,
      id: newId(),
      groupId,
      x: source.x + 48,
      y: source.y + 40,
    }));
    const shift = groupShift(copies);
    copies = copies.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }));
    commitFrom(current, { ...current, furniture: [...current.furniture, ...copies] });
    setSelectedId(copies[0]?.id ?? null);
  }

  function onRoomPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-rotate]') || target.closest('.piece')) return;
    if (carryRef.current?.sticky) {
      event.preventDefault();
      dropCarry(event.clientX, event.clientY);
      return;
    }
    if (carryRef.current) return;
    const point = toRoom(event);
    const currentTool = toolRef.current;
    if (currentTool === 'select') {
      setSelectedId(null);
      return;
    }
    if (currentTool === 'row') placeRow(point.x, point.y);
    else place(currentTool, point.x, point.y);
  }

  function onFurniturePointerDown(event: ReactPointerEvent<HTMLDivElement>, furniture: Furniture) {
    event.stopPropagation();
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-rotate]')) return;
    if (carryRef.current?.sticky) {
      dropCarry(event.clientX, event.clientY);
      return;
    }
    if (carryRef.current) return;
    if (toolRef.current !== 'select') return;
    if (target.closest('[data-seat]')) {
      setSelectedId(furniture.id);
      return;
    }
    event.preventDefault();
    pickup(furniture, event.clientX, event.clientY);
  }

  function seatFromPoint(clientX: number, clientY: number): HotSeat {
    const room = roomRef.current;
    if (!room) return null;
    const rect = room.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * ROOM_W;
    const y = ((clientY - rect.top) / rect.height) * ROOM_H;
    if (x < 0 || y < 0 || x > ROOM_W || y > ROOM_H) return null;

    let best: HotSeat = null;
    let bestScore = 1;
    for (const furniture of classroomRef.current.furniture) {
      const count = seatLocals(furniture.kind).length;
      for (let index = 0; index < count; index += 1) {
        const seat = seatWorld(furniture, index);
        const label = labelWorld(furniture, index);
        const anchors = [
          seat ? { point: seat, radius: 50 } : null,
          label ? { point: label, radius: 64 } : null,
        ];
        for (const anchor of anchors) {
          if (!anchor) continue;
          const score = Math.hypot(anchor.point.x - x, anchor.point.y - y) / anchor.radius;
          if (score < bestScore) {
            bestScore = score;
            best = { furnitureId: furniture.id, seatIndex: index };
          }
        }
      }
    }
    return best;
  }

  function overDrawer(x: number, y: number): boolean {
    const element = document.elementFromPoint(x, y);
    return Boolean(element?.closest('[data-unseat]'));
  }

  function applyDrop(studentId: string, hot: HotSeat, drawer: boolean) {
    const snapshot = snapshotRef.current;
    const current = classroomRef.current;
    if (!snapshot) return;
    const seated = current.placements.some((placement) => placement.studentId === studentId);
    if (drawer) {
      if (!seated) return;
      commitFrom(snapshot, { ...current, placements: moveStudent(current.placements, studentId, null) });
      return;
    }
    if (!hot) return;
    const same = current.placements.some(
      (placement) =>
        placement.studentId === studentId && placement.furnitureId === hot.furnitureId && placement.seatIndex === hot.seatIndex,
    );
    if (same) return;
    commitFrom(snapshot, { ...current, placements: moveStudent(current.placements, studentId, hot) });
  }

  function beginStudentDrag(studentId: string, x: number, y: number) {
    snapshotRef.current = classroomRef.current;
    document.body.classList.add('is-dragging');
    const paint = (clientX: number, clientY: number) => {
      setDrag({
        studentId,
        x: clientX,
        y: clientY,
        hot: seatFromPoint(clientX, clientY),
        overDrawer: overDrawer(clientX, clientY),
      });
    };
    paint(x, y);
    const move = (ev: PointerEvent) => paint(ev.clientX, ev.clientY);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-dragging');
      const moved = Math.hypot(ev.clientX - x, ev.clientY - y) > 6;
      const hot = seatFromPoint(ev.clientX, ev.clientY);
      const drawer = overDrawer(ev.clientX, ev.clientY);
      setDrag(null);
      if (moved) applyDrop(studentId, hot, drawer);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onSeatPointerDown(studentId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (dragging) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        dragging = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        beginStudentDrag(studentId, ev.clientX, ev.clientY);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragging) openStudent(studentId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onDragStudent(studentId: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // La capture peut échouer si le pointeur a déjà été relâché.
    }
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (dragging) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        dragging = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        beginStudentDrag(studentId, ev.clientX, ev.clientY);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function openStudent(id: string) {
    const student = classroomRef.current.students.find((item) => item.id === id);
    if (!student) return;
    setEditing({ ...student, friendIds: [...student.friendIds], avoidIds: [...student.avoidIds] });
    setEditingIsNew(false);
  }

  function openNewStudent() {
    setEditing(blankStudent(classroomRef.current.students));
    setEditingIsNew(true);
  }

  function saveStudent(andAnother = false) {
    if (!editing) return;
    const cleaned: Student = {
      ...editing,
      firstName: editing.firstName.trim(),
      lastName: editing.lastName.trim(),
      number: editing.number.trim(),
    };
    if (!cleaned.firstName || !cleaned.lastName) return;
    const current = classroomRef.current;
    const students = mirrorRelations(current.students, cleaned);
    commitFrom(current, { ...current, students });
    if (andAnother) {
      setEditing(blankStudent(students));
      setEditingIsNew(true);
      return;
    }
    setEditing(null);
  }

  function deleteEditing() {
    if (!editing || editingIsNew) return;
    const current = classroomRef.current;
    const removed = removeStudent(current.students, current.placements, editing.id);
    commitFrom(current, { ...current, ...removed });
    setEditing(null);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(classroomRef.current.code);
      flash('Code copié');
    } catch {
      flash(classroomRef.current.code);
    }
  }

  function exportJson() {
    const current = classroomRef.current;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${current.code}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMenuOpen(false);
  }

  async function importFile(file: File) {
    try {
      const raw = JSON.parse(await file.text()) as Partial<Classroom>;
      const created = await createClass({
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Plan importé',
        students: Array.isArray(raw.students) ? raw.students : [],
        furniture: Array.isArray(raw.furniture) ? raw.furniture : [],
        placements: Array.isArray(raw.placements) ? raw.placements : [],
      });
      onOpen(created);
    } catch {
      flash('Ce fichier ne peut pas être lu');
    } finally {
      setMenuOpen(false);
    }
  }

  async function destroy() {
    try {
      await deleteClass(classroomRef.current.code);
      onExit();
    } catch {
      flash('Impossible de supprimer le plan');
    }
  }

  async function exit() {
    const current = classroomRef.current;
    if (current.updatedAt !== lastSaved.current) {
      try {
        await saveClass(current);
        lastSaved.current = current.updatedAt;
      } catch (error) {
        setSaveState(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error');
        flash(error instanceof ApiError ? error.message : 'Enregistrement impossible');
        return;
      }
    }
    onExit();
  }

  async function reloadFromServer() {
    const { getClass } = await import('../api');
    try {
      const fresh = await getClass(classroomRef.current.code);
      lastSaved.current = fresh.updatedAt;
      pastRef.current = [];
      futureRef.current = [];
      setPast([]);
      setFuture([]);
      classroomRef.current = fresh;
      setClassroom(fresh);
      setSaveState('saved');
      setEditing(null);
    } catch {
      flash('Rechargement impossible');
    }
  }

  useEffect(() => {
    document.title = classroom.name ? `${classroom.name} · Ma Classe` : 'Ma Classe';
  }, [classroom.name]);

  useEffect(() => {
    if (selectedId && !classroom.furniture.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [classroom.furniture, selectedId]);

  useEffect(() => {
    if (classroom.updatedAt === lastSaved.current) return;
    const snapshot = classroom;
    const handle = window.setTimeout(() => {
      setSaveState('saving');
      void saveClass(snapshot)
        .then(() => {
          if (classroomRef.current.updatedAt === snapshot.updatedAt) {
            lastSaved.current = snapshot.updatedAt;
            setSaveState('saved');
          }
        })
        .catch((error: unknown) => {
          if (classroomRef.current.updatedAt !== snapshot.updatedAt) return;
          setSaveState(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error');
        });
    }, 650);
    return () => window.clearTimeout(handle);
  }, [classroom]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const current = classroomRef.current;
      if (current.updatedAt === lastSaved.current) return;
      void fetch(`/api/classes/${encodeURIComponent(current.code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
        keepalive: true,
      });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (dialogRef.current) return;
      if (event.key === 'Escape') {
        actionsRef.current.escape();
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) actionsRef.current.redo();
        else actionsRef.current.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        actionsRef.current.redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'd') {
        event.preventDefault();
        actionsRef.current.duplicate();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        actionsRef.current.remove();
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        actionsRef.current.rotate(event.shiftKey ? -1 : 1);
        return;
      }
      const step = event.shiftKey ? 24 : 8;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        actionsRef.current.nudge(-step, 0);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        actionsRef.current.nudge(step, 0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        actionsRef.current.nudge(0, -step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        actionsRef.current.nudge(0, step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (dialogRef.current) return;
      const carrying = Boolean(carryRef.current);
      const placing = toolRef.current !== 'select';
      if (!carrying && !placing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.drawer, .modal, .roster')) return;
      if (!carrying && !target?.closest('.stage')) return;
      event.preventDefault();
      actionsRef.current.rotate(event.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (tool === 'select') return;
    const move = (event: PointerEvent) => setPointer({ x: event.clientX, y: event.clientY });
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [tool]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onStickyMove);
      window.removeEventListener('pointerdown', onOutsidePointerDown, true);
    };
  }, [onOutsidePointerDown, onStickyMove]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  actionsRef.current = {
    escape: () => {
      cancelCarry();
      setTool('select');
      setSelectedId(null);
    },
    rotate: rotateActive,
    remove: deleteSelected,
    undo,
    redo,
    duplicate: duplicateSelected,
    nudge: (dx, dy) => {
      if (carryRef.current) return;
      nudge(dx, dy);
    },
  };

  const ghost = carry
    ? (() => {
        const piece = classroom.furniture.find((item) => item.id === carry.id);
        if (!piece) return null;
        return {
          kind: piece.kind,
          rotation: carry.rotation,
          clientX: carry.clientX,
          clientY: carry.clientY,
          parts: groupGhostParts(classroom.furniture, piece.id, carry.rotation),
          label: carry.sticky ? 'Clic pour poser' : 'Relâcher pour poser',
        };
      })()
    : tool !== 'select' && pointer
      ? {
          kind: tool === 'row' ? ('pupitre' as const) : tool,
          rotation: previewRotation,
          clientX: pointer.x,
          clientY: pointer.y,
          count: tool === 'row' ? rowCount : 1,
          label: tool === 'row' ? `${rowCount} pupitres` : 'Clic pour poser',
        }
      : null;
  const selectedFacing = selected ? facingLabel(carry && carry.id === selected.id ? carry.rotation : selected.rotation) : '';
  const selectedSeats = selected ? classroom.placements.filter((placement) => placement.furnitureId === selected.id).length : 0;

  const draggedStudent = drag ? classroom.students.find((student) => student.id === drag.studentId) : undefined;
  const saveLabel =
    saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' ? 'Enregistré' : saveState === 'conflict' ? 'Conflit' : 'À reprendre';
  const baseLabel = driver === 'sqlite' ? 'Base SQLite' : driver === 'json' ? 'Base fichier' : 'Base locale';

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="brand-btn" onClick={() => void exit()}>
          <AppleMark className="brand-mark" />
          <span className="brand-name">Ma Classe</span>
        </button>
        <input
          className="name-input"
          aria-label="Nom de la classe"
          value={classroom.name}
          maxLength={80}
          spellCheck={false}
          onChange={(event) => rename(event.target.value)}
        />
        <button type="button" className="code-pill" onClick={() => void copyCode()} title="Cliquer pour copier le code du plan">
          <span>Code</span>
          {classroom.code}
        </button>
        <p className={`save-state is-${saveState}`} aria-live="polite">
          {saveLabel}
        </p>
        <button type="button" className="icon-btn" onClick={undo} disabled={past.length === 0} aria-label="Annuler" title="Annuler (Ctrl+Z)">
          ↺
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={future.length === 0} aria-label="Rétablir" title="Rétablir (Ctrl+Y)">
          ↻
        </button>
        <div className="menu" ref={menuRef}>
          <button type="button" className="btn btn-ghost" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            Fichier
          </button>
          {menuOpen ? (
            <div className="menu-pop" role="menu">
              <button type="button" onClick={exportJson}>
                Exporter une copie
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}>
                Importer une copie
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  window.print();
                }}
              >
                Imprimer
              </button>
              {confirmDelete ? (
                <div className="confirm-pop">
                  <p>Supprimer ce plan de la base ?</p>
                  <button type="button" className="btn btn-danger" onClick={() => void destroy()}>
                    Supprimer
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </button>
                </div>
              ) : (
                <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
                  Supprimer le plan
                </button>
              )}
            </div>
          ) : null}
        </div>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="Outils de la salle">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? 'tool is-on' : 'tool'}
              aria-pressed={tool === item.id}
              title={item.hint}
              onClick={(event) => selectTool(item.id, event.clientX, event.clientY)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          {tool === 'row' ? (
            <div className="stepper">
              <button type="button" onClick={() => setRowCount((count) => Math.max(2, count - 1))} aria-label="Moins de pupitres">
                −
              </button>
              <strong>{rowCount}</strong>
              <button type="button" onClick={() => setRowCount((count) => Math.min(8, count + 1))} aria-label="Plus de pupitres">
                +
              </button>
            </div>
          ) : null}
        </nav>

        <RoomCanvas
          classroom={classroom}
          tool={tool}
          selectedId={selectedId}
          links={links}
          linkMode={linkMode}
          focusKey={focusKey}
          hot={drag?.hot ?? null}
          sourceStudentId={drag?.studentId ?? null}
          carriedId={carry?.id ?? null}
          ghost={ghost}
          roomRef={roomRef}
          onRoomPointerDown={onRoomPointerDown}
          onFurniturePointerDown={onFurniturePointerDown}
          onSeatPointerDown={onSeatPointerDown}
          onRotatePiece={(id) => {
            selectedRef.current = id;
            setSelectedId(id);
            rotateSelected(-1);
          }}
          onRotate={rotateActive}
        />

        <StudentDrawer
          classroom={classroom}
          links={links}
          focusKey={focusKey}
          overDrawer={Boolean(drag?.overDrawer)}
          onEdit={openStudent}
          onCreate={openNewStudent}
          onDrag={onDragStudent}
          onFocus={setFocusKey}
        />
      </div>

      <footer className="statusbar">
        {selected ? (
          <div className="selection-bar" data-keep-carry>
            <strong>
              {FURNITURE_LABEL[selected.kind]} · {selectedFacing}
            </strong>
            <button type="button" onClick={() => rotateActive(-1)} title="Pivoter (Maj+R)">
              Pivoter
            </button>
            <button type="button" onClick={duplicateSelected} title="Dupliquer (Ctrl+D)">
              Dupliquer
            </button>
            <button type="button" onClick={unseatSelected} disabled={selectedSeats === 0} title="Retirer les élèves. Ils reviennent dans la liste.">
              Retirer
            </button>
            <button type="button" onClick={deleteSelected} title="Supprimer le meuble. Les élèves reviennent dans la liste.">
              Supprimer le meuble
            </button>
          </div>
        ) : (
          <p>
            {seatedCount} / {classroom.students.length} assis
          </p>
        )}
        <p className={closeConflicts > 0 ? 'is-alert' : 'is-calm'}>
          {closeConflicts > 0 ? `${closeConflicts} conflit${closeConflicts > 1 ? 's' : ''}` : 'Aucun conflit proche'}
        </p>
        <p className="is-calm">
          {closeFriends === 0
            ? 'Aucune amitié côte à côte'
            : closeFriends === 1
              ? '1 amitié côte à côte'
              : `${closeFriends} amitiés côte à côte`}
        </p>
        <button type="button" className="link-toggle" aria-pressed={linkMode === 'tous'} onClick={() => setLinkMode((mode) => (mode === 'proches' ? 'tous' : 'proches'))}>
          {linkMode === 'proches' ? 'Liens proches' : 'Tous les liens'}
        </button>
        <p className="legend">
          <i className="swatch is-girl" /> Filles
          <i className="swatch is-boy" /> Gars
          <i className="swatch is-na" /> N/A
          <i className="swatch is-friend" /> Amis
          <i className="swatch is-avoid" /> Pas ensemble
        </p>
        <p className="base-label">{baseLabel}</p>
        {saveState === 'conflict' ? (
          <button type="button" className="btn btn-ghost" onClick={() => void reloadFromServer()}>
            Recharger
          </button>
        ) : null}
      </footer>

      {editing ? (
        <StudentDialog
          draft={editing}
          others={classroom.students.filter((student) => student.id !== editing.id)}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveStudent}
          onSaveAnother={editingIsNew ? () => saveStudent(true) : undefined}
          onDelete={editingIsNew ? undefined : deleteEditing}
        />
      ) : null}

      {draggedStudent ? (
        <div className="ghost" style={{ left: drag?.x, top: drag?.y }}>
          <Chip student={draggedStudent} />
        </div>
      ) : null}
      {toast ? <p className="toast">{toast}</p> : null}
      <p className="sr-only" aria-live="polite">
        {closeConflicts} conflits proches
      </p>
    </div>
  );
}
