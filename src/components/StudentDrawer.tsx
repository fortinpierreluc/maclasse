import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Classroom } from '../types';
import { GENDER_LABEL } from '../types';
import type { PairLink } from '../relations';
import { displayName, foldSearch, sortStudents } from '../relations';
import { GENDER_TINT } from './Chip';

function pairKey(link: PairLink): string {
  return [link.a, link.b].sort().join(':');
}

export function StudentDrawer({
  classroom,
  links,
  focusKey,
  overDrawer,
  onEdit,
  onCreate,
  onDrag,
  onFocus,
  onAutoPlace,
}: {
  classroom: Classroom;
  links: PairLink[];
  focusKey: string | null;
  overDrawer: boolean;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onDrag: (id: string, event: PointerEvent<HTMLElement>) => void;
  onFocus: (key: string | null) => void;
  onAutoPlace: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'tous' | 'placer' | 'assis'>('tous');
  const seated = useMemo(() => new Set(classroom.placements.map((placement) => placement.studentId)), [classroom.placements]);
  const byId = useMemo(() => new Map(classroom.students.map((student) => [student.id, student])), [classroom.students]);

  const avoids = links.filter((link) => link.kind === 'avoid');
  const closeAvoids = avoids.filter((link) => link.close);
  const calmAvoids = avoids.filter((link) => !link.close);
  const closeFriends = links.filter((link) => link.kind === 'friend' && link.close).length;

  const students = useMemo(() => {
    const needle = foldSearch(query.trim());
    return sortStudents(classroom.students).filter((student) => {
      const isSeated = seated.has(student.id);
      if (filter === 'placer' && isSeated) return false;
      if (filter === 'assis' && !isSeated) return false;
      if (!needle) return true;
      return foldSearch(`${student.number} ${student.firstName} ${student.lastName} ${student.grade}`).includes(needle);
    });
  }, [classroom.students, filter, query, seated]);

  return (
    <aside className={overDrawer ? 'drawer is-drop' : 'drawer'} data-unseat>
      <div className="drawer-head">
        <div>
          <p className="eyebrow">Élèves</p>
          <h2>
            {seated.size} / {classroom.students.length} assis
          </h2>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          Ajouter
        </button>
      </div>

      {classroom.students.length > 0 ? (
        <button
          type="button"
          className="btn btn-ghost autoplace-btn"
          onClick={onAutoPlace}
          title="Placer tous les élèves sans conflit proche, en rapprochant les amis"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z" fill="currentColor" />
            <path d="M18.5 15l.8 2 2 .8-2 .7-.8 2-.7-2-2-.7 2-.8.7-2z" fill="currentColor" />
          </svg>
          Placer les élèves
        </button>
      ) : null}

      <section className="watch" aria-label="Contraintes de placement">
        {closeAvoids.length > 0 ? (
          <>
            <h3>{closeAvoids.length === 1 ? '1 conflit' : `${closeAvoids.length} conflits`}</h3>
            <ul>
              {closeAvoids.map((link) => {
                const key = pairKey(link);
                const left = byId.get(link.a);
                const right = byId.get(link.b);
                if (!left || !right) return null;
                return (
                  <li key={key}>
                    <button type="button" className={focusKey === key ? 'watch-card is-on' : 'watch-card'} onClick={() => onFocus(focusKey === key ? null : key)}>
                      <strong>{left.firstName}</strong>
                      <span>est trop près de</span>
                      <strong>{right.firstName}</strong>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="calm">
            {closeFriends > 0
              ? `Tout est calme. ${closeFriends === 1 ? 'Une amitié est' : `${closeFriends} amitiés sont`} côte à côte.`
              : 'Aucun conflit parmi les élèves assis.'}
          </p>
        )}
        {calmAvoids.length > 0 ? (
          <details>
            <summary>Contraintes respectées ({calmAvoids.length})</summary>
            <ul>
              {calmAvoids.map((link) => {
                const left = byId.get(link.a);
                const right = byId.get(link.b);
                if (!left || !right) return null;
                const key = pairKey(link);
                return (
                  <li key={key}>
                    <button type="button" className="watch-card is-calm" onClick={() => onFocus(focusKey === key ? null : key)}>
                      {left.firstName} et {right.firstName} ne sont pas côte à côte
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </section>

      <div className="drawer-tools">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher un élève"
          aria-label="Chercher un élève"
        />
        <div className="filters" role="group" aria-label="Filtrer la liste">
          {(
            [
              ['tous', 'Tous'],
              ['placer', 'À placer'],
              ['assis', 'Assis'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'is-on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="roster">
        {students.map((student) => {
          const isSeated = seated.has(student.id);
          return (
            <li key={student.id}>
              <article
                className="student-card"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  if ((event.target as HTMLElement).closest('[data-edit]')) return;
                  onDrag(student.id, event);
                }}
              >
                <div className="student-main">
                  <span className="avatar" style={{ background: GENDER_TINT[student.gender] }}>
                    {student.number || student.firstName.slice(0, 1)}
                  </span>
                  <span className="who">
                    <strong>
                      {student.firstName} {student.lastName}
                    </strong>
                    <small>
                      {GENDER_LABEL[student.gender]}
                      {student.grade ? ` · ${student.grade}` : ''}
                      {isSeated ? ' · assis' : ' · à placer'}
                    </small>
                  </span>
                </div>
                <button
                  type="button"
                  className="edit-picto"
                  data-edit
                  aria-label={`Modifier ${displayName(student)}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onEdit(student.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M13 7.5l3.5 3.5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              </article>
            </li>
          );
        })}
      </ul>
      {classroom.students.length === 0 ? (
        <p className="empty-copy">Ajoutez les élèves, puis glissez-les vers un siège.</p>
      ) : students.length === 0 ? (
        <p className="empty-copy">Aucun élève dans ce filtre.</p>
      ) : (
        <p className="empty-copy">Glissez une fiche vers un siège. Le crayon ouvre la fiche. Déposez ici pour lever un élève.</p>
      )}
    </aside>
  );
}
