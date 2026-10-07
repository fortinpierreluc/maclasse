import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Classroom, Furniture, FurnitureKind, Tool } from '../types';
import { FURNITURE_LABEL, ROOM_H, ROOM_W } from '../types';
import { facingLabel, furnitureSize, labelWorld, rowMates, rowOffsets, seatLocals } from '../geometry';
import { deskName, type PairLink } from '../relations';

const FRAME = 12;

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function curve(ax: number, ay: number, bx: number, by: number, bend: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const pad = Math.min(44, Math.max(10, len * 0.32));
  const sx = ax + (dx / len) * pad;
  const sy = ay + (dy / len) * pad;
  const ex = bx - (dx / len) * pad;
  const ey = by - (dy / len) * pad;
  const mx = (sx + ex) / 2 + (-dy / len) * bend;
  const my = (sy + ey) / 2 + (dx / len) * bend;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

export type CursorGhost = {
  kind: FurnitureKind;
  rotation: number;
  clientX: number;
  clientY: number;
  label: string;
  count?: number;
  parts?: { dx: number; dy: number; rotation: number; kind: FurnitureKind }[];
};

function PieceFace({ kind, name }: { kind: FurnitureKind; name?: string }) {
  return (
    <>
      <span className="front-mark" />
      {kind === 'pupitre' ? <div className="desk-top" /> : null}
      {kind === 'table2' || kind === 'table4' || kind === 'table6' ? <div className="table-top" /> : null}
      {kind === 'bureau' ? (
        <div className="bureau-top">
          <span className="papers" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="pencil one" aria-hidden="true" />
          <span className="pencil two" aria-hidden="true" />
          <span className="apple" aria-hidden="true" />
          <span className="cup" aria-hidden="true" />
        </div>
      ) : null}
      {kind === 'porte' ? <span className="knob" aria-hidden="true" /> : null}
      {kind === 'tableau' ? (
        <div className="board-inner">
          <p className="chalk">{name || 'Ma classe'}</p>
        </div>
      ) : null}
    </>
  );
}

function GhostPreview({ ghost, scale, name }: { ghost: CursorGhost; scale: number; name: string }) {
  const count = Math.max(1, ghost.count ?? 1);
  const fallback =
    count > 1
      ? rowOffsets(count, ghost.rotation).map((offset) => ({
          dx: offset.x,
          dy: offset.y,
          rotation: ghost.rotation,
          kind: ghost.kind,
        }))
      : [{ dx: 0, dy: 0, rotation: ghost.rotation, kind: ghost.kind }];
  const parts = ghost.parts && ghost.parts.length > 0 ? ghost.parts : fallback;
  const lowest = Math.max(...parts.map((part) => part.dy + furnitureSize(part.kind).h / 2));

  return (
    <div className="cursor-ghost" style={{ left: ghost.clientX, top: ghost.clientY }}>
      <div className="cursor-ghost-scale" style={{ transform: `scale(${scale})` }}>
        {parts.map((part, index) => {
          const size = furnitureSize(part.kind);
          return (
            <div
              key={index}
              className={`piece is-floating kind-${part.kind}`}
              style={{
                width: size.w,
                height: size.h,
                left: part.dx - size.w / 2,
                top: part.dy - size.h / 2,
                transform: `rotate(${part.rotation}deg)`,
              }}
            >
              <PieceFace kind={part.kind} name={name} />
            </div>
          );
        })}
      </div>
      <span className="cursor-ghost-label" style={{ top: lowest * scale + 12 }}>
        {ghost.label}
      </span>
    </div>
  );
}

export function RoomCanvas({
  classroom,
  tool,
  selectedId,
  links,
  linkMode,
  focusKey,
  hot,
  sourceStudentId,
  carriedId,
  ghost,
  roomRef,
  onRoomPointerDown,
  onFurniturePointerDown,
  onSeatPointerDown,
  onRotatePiece,
  onRotate,
}: {
  classroom: Classroom;
  tool: Tool;
  selectedId: string | null;
  links: PairLink[];
  linkMode: 'proches' | 'tous';
  focusKey: string | null;
  hot: { furnitureId: string; seatIndex: number } | null;
  sourceStudentId: string | null;
  carriedId: string | null;
  ghost: CursorGhost | null;
  roomRef: RefObject<HTMLDivElement | null>;
  onRoomPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFurniturePointerDown: (event: ReactPointerEvent<HTMLDivElement>, furniture: Furniture) => void;
  onSeatPointerDown: (studentId: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  onRotatePiece: (id: string) => void;
  onRotate: (direction: 1 | -1) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);
  const students = useMemo(() => new Map(classroom.students.map((student) => [student.id, student])), [classroom.students]);
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const link of links) {
      if (link.kind === 'avoid' && link.close) {
        ids.add(link.a);
        ids.add(link.b);
      }
    }
    return ids;
  }, [links]);
  const friendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const link of links) {
      if (link.kind === 'friend' && link.close) {
        ids.add(link.a);
        ids.add(link.b);
      }
    }
    return ids;
  }, [links]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const pad = getComputedStyle(element);
      const padX = (Number.parseFloat(pad.paddingLeft) || 0) + (Number.parseFloat(pad.paddingRight) || 0);
      const padY = (Number.parseFloat(pad.paddingTop) || 0) + (Number.parseFloat(pad.paddingBottom) || 0);
      const width = element.clientWidth - padX;
      const height = element.clientHeight - padY;
      const next = Math.min((width - FRAME * 2) / ROOM_W, (height - FRAME * 2) / ROOM_H);
      setScale(Number.isFinite(next) && next > 0 ? next : 0.4);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visibleLinks = links.filter((link) => linkMode === 'tous' || link.close);
  const labelBoost = scale > 0 ? Math.min(2.2, 0.92 / scale) : 1;
  const carriedMates = useMemo(() => {
    if (!carriedId) return new Set<string>();
    return new Set(rowMates(classroom.furniture, carriedId).map((item) => item.id));
  }, [classroom.furniture, carriedId]);
  const rowMateIds = useMemo(() => {
    const id = carriedId ?? selectedId;
    if (!id) return new Set<string>();
    const mates = rowMates(classroom.furniture, id);
    if (mates.length < 2) return new Set<string>();
    return new Set(mates.map((item) => item.id));
  }, [classroom.furniture, carriedId, selectedId]);

  return (
    <div className="stage" ref={stageRef}>
      {carriedId || tool !== 'select' ? (
        <div className="place-hint" data-keep-carry>
          <button
            type="button"
            aria-label="Pivoter vers la gauche"
            title="Pivoter vers la gauche"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRotate(-1);
            }}
          >
            ↺
          </button>
          <span>
            {ghost ? facingLabel(ghost.rotation) : 'Prêt à poser'}
            {carriedId ? ' · clic pour poser, Échap pour annuler' : ' · clic pour poser'}
          </span>
          <button
            type="button"
            aria-label="Pivoter vers la droite"
            title="Pivoter vers la droite"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRotate(1);
            }}
          >
            ↻
          </button>
        </div>
      ) : null}
      <div className="room-frame" style={{ width: ROOM_W * scale + FRAME * 2, height: ROOM_H * scale + FRAME * 2 }}>
        <div
          ref={roomRef}
          className={carriedId ? 'room is-carrying' : 'room'}
          data-tool={tool}
          style={{ width: ROOM_W, height: ROOM_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          onPointerDown={onRoomPointerDown}
        >
          {classroom.furniture.map((furniture) => {
            const size = furnitureSize(furniture.kind);
            const locals = seatLocals(furniture.kind);
            const parked = carriedMates.has(furniture.id);
            const selected = selectedId === furniture.id;
            const rowmate = rowMateIds.has(furniture.id) && !selected;
            return (
              <div
                key={furniture.id}
                role="button"
                tabIndex={0}
                aria-label={`${FURNITURE_LABEL[furniture.kind]}, ${facingLabel(furniture.rotation)}`}
                className={['piece', `kind-${furniture.kind}`, selected ? 'is-selected' : '', rowmate ? 'is-rowmate' : '', parked ? 'is-parked' : ''].filter(Boolean).join(' ')}
                style={{
                  width: size.w,
                  height: size.h,
                  left: furniture.x - size.w / 2,
                  top: furniture.y - size.h / 2,
                  transform: `rotate(${furniture.rotation}deg)`,
                }}
                title={`${FURNITURE_LABEL[furniture.kind]} · ${facingLabel(furniture.rotation)}`}
                onPointerDown={(event) => onFurniturePointerDown(event, furniture)}
              >
                <PieceFace kind={furniture.kind} name={classroom.name} />
                {selected && !parked ? (
                  <button
                    type="button"
                    className="spin-handle"
                    data-rotate
                    aria-label="Pivoter"
                    title="Pivoter"
                    style={{ transform: `rotate(${-furniture.rotation}deg)` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onRotatePiece(furniture.id);
                    }}
                  >
                    ↻
                  </button>
                ) : null}
                {locals.map((local, index) => {
                  const placement = classroom.placements.find(
                    (item) => item.furnitureId === furniture.id && item.seatIndex === index,
                  );
                  const student = placement ? students.get(placement.studentId) : undefined;
                  const isHot = hot?.furnitureId === furniture.id && hot.seatIndex === index;
                  const gender = student ? `is-${student.gender}` : '';
                  const conflict = student ? conflictIds.has(student.id) : false;
                  const friend = student ? friendIds.has(student.id) : false;
                  return (
                    <div
                      key={index}
                      className={['seat', gender, isHot ? 'is-hot' : '', conflict ? 'is-conflict' : '', !conflict && friend ? 'is-friend' : '', student && sourceStudentId === student.id ? 'is-source' : ''].filter(Boolean).join(' ')}
                      data-seat
                      data-furniture-id={furniture.id}
                      data-seat-index={index}
                      style={{ left: size.w / 2 + local.x, top: size.h / 2 + local.y }}
                      onPointerDown={student ? (event) => onSeatPointerDown(student.id, event) : undefined}
                    >
                      <div className="seat-chair" aria-hidden={student ? true : undefined} />
                      {student ? null : (
                        <span className="seat-empty" role="button" tabIndex={-1} style={{ transform: `translate(-50%, -50%) rotate(${-furniture.rotation}deg)` }}>
                          vide
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {classroom.furniture.length === 0 ? <p className="room-empty">La salle est prête. Ajoutez des pupitres depuis la colonne de gauche.</p> : null}

          <svg className="links" viewBox={`0 0 ${ROOM_W} ${ROOM_H}`} aria-hidden="true">
            {visibleLinks.map((link) => {
              const key = pairKey(link.a, link.b);
              const focused = focusKey === key;
              const dimmed = Boolean(focusKey) && !focused;
              const path = curve(link.ax, link.ay, link.bx, link.by, link.kind === 'avoid' ? 34 : -26);
              return (
                <path
                  key={key}
                  d={path}
                  className={[
                    'link',
                    link.kind === 'avoid' ? 'is-avoid' : 'is-friend',
                    link.close ? '' : 'is-far',
                    focused ? 'is-focus' : '',
                    dimmed ? 'is-dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              );
            })}
          </svg>

          {classroom.placements.map((placement) => {
            const furniture = classroom.furniture.find((item) => item.id === placement.furnitureId);
            const student = students.get(placement.studentId);
            if (!furniture || !student) return null;
            const pos = labelWorld(furniture, placement.seatIndex);
            if (!pos) return null;
            const isHot = hot?.furnitureId === placement.furnitureId && hot.seatIndex === placement.seatIndex;
            const fullName = [student.number && `no ${student.number}`, `${student.firstName} ${student.lastName}`.trim(), student.grade]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                key={placement.studentId}
                className={[
                  'floater',
                  'desk-label',
                  isHot ? 'is-hot' : '',
                  conflictIds.has(student.id) ? 'is-conflict' : '',
                  !conflictIds.has(student.id) && friendIds.has(student.id) ? 'is-friend' : '',
                  sourceStudentId === student.id ? 'is-source' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: pos.x, top: pos.y, transform: `translate(-50%, -50%) scale(${labelBoost})` }}
                onPointerDown={(event) => onSeatPointerDown(student.id, event)}
              >
                <span className="desk-name" title={fullName}>
                  {deskName(student, classroom.students)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {ghost ? (
        <GhostPreview ghost={ghost} scale={scale} name={classroom.name} />
      ) : null}
    </div>
  );
}
