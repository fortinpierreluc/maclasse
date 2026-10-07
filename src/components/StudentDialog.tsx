import { useEffect, useMemo, useRef, useState } from 'react';
import type { Student } from '../types';
import { GENDER_LABEL, GRADES } from '../types';
import { displayName, foldSearch, sortStudents } from '../relations';

type Relation = 'friend' | 'avoid' | 'none';

function relation(student: Student, otherId: string): Relation {
  if (student.avoidIds.includes(otherId)) return 'avoid';
  if (student.friendIds.includes(otherId)) return 'friend';
  return 'none';
}

export function StudentDialog({
  draft,
  others,
  onChange,
  onClose,
  onSave,
  onSaveAnother,
  onDelete,
}: {
  draft: Student;
  others: Student[];
  onChange: (student: Student) => void;
  onClose: () => void;
  onSave: () => void;
  onSaveAnother?: () => void;
  onDelete?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const duplicateNumber = others.some((student) => student.number && student.number === draft.number.trim());
  const canSave = draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0;

  const visible = useMemo(() => {
    const needle = foldSearch(query.trim());
    return sortStudents(others).filter((student) => {
      if (!needle) return true;
      return foldSearch(`${student.number} ${student.firstName} ${student.lastName}`).includes(needle);
    });
  }, [others, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    firstNameRef.current?.focus();
  }, [draft.id]);

  function cycle(otherId: string) {
    const current = relation(draft, otherId);
    const next: Relation = current === 'none' ? 'friend' : current === 'friend' ? 'avoid' : 'none';
    onChange({
      ...draft,
      friendIds: next === 'friend' ? [...draft.friendIds.filter((id) => id !== otherId), otherId] : draft.friendIds.filter((id) => id !== otherId),
      avoidIds: next === 'avoid' ? [...draft.avoidIds.filter((id) => id !== otherId), otherId] : draft.avoidIds.filter((id) => id !== otherId),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-labelledby="student-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Fiche élève</p>
            <h2 id="student-dialog-title">{draft.firstName || draft.lastName ? displayName(draft) : 'Nouvel élève'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className="form-grid">
          <label>
            Numéro
            <input
              inputMode="numeric"
              maxLength={12}
              value={draft.number}
              onChange={(event) => onChange({ ...draft, number: event.target.value })}
              placeholder="12"
            />
          </label>
          <label>
            Degré scolaire
            <select value={draft.grade} onChange={(event) => onChange({ ...draft, grade: event.target.value })}>
              <option value="">Choisir</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
              {draft.grade && !GRADES.includes(draft.grade) ? <option value={draft.grade}>{draft.grade}</option> : null}
            </select>
          </label>
          <label>
            Prénom
            <input
              ref={firstNameRef}
              required
              maxLength={60}
              value={draft.firstName}
              onChange={(event) => onChange({ ...draft, firstName: event.target.value })}
              placeholder="Léa"
            />
          </label>
          <label>
            Nom
            <input
              required
              maxLength={60}
              value={draft.lastName}
              onChange={(event) => onChange({ ...draft, lastName: event.target.value })}
              placeholder="Tremblay"
            />
          </label>
        </div>
        {duplicateNumber ? <p className="form-note">Ce numéro est déjà utilisé.</p> : null}

        <fieldset className="segmented">
          <legend>Genre</legend>
          {(['fille', 'gars', 'na'] as const).map((gender) => (
            <button
              key={gender}
              type="button"
              aria-pressed={draft.gender === gender}
              className={draft.gender === gender ? 'is-on' : ''}
              onClick={() => onChange({ ...draft, gender })}
            >
              {GENDER_LABEL[gender]}
            </button>
          ))}
        </fieldset>

        <div className="rel-head">
          <div>
            <h3>Avec qui</h3>
            <p>Un clic : ami. Deuxième clic : ne peut pas s'asseoir avec. Troisième clic : retirer.</p>
          </div>
          {others.length > 8 ? (
            <input
              className="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer"
              aria-label="Filtrer les élèves"
            />
          ) : null}
        </div>

        {others.length === 0 ? (
          <p className="form-note">Ajoutez d'autres élèves pour indiquer les amis et les contraintes.</p>
        ) : (
          <div className="rel-grid">
            {visible.map((student) => {
              const kind = relation(draft, student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  className={`rel is-${kind}`}
                  onClick={() => cycle(student.id)}
                  aria-pressed={kind !== 'none'}
                >
                  <span>
                    {student.number ? <em>{student.number}</em> : null}
                    {displayName(student)}
                  </span>
                  <small>{kind === 'friend' ? 'Ami' : kind === 'avoid' ? 'Pas ensemble' : 'Neutre'}</small>
                </button>
              );
            })}
          </div>
        )}

        <footer className="modal-foot">
          {onDelete ? (
            confirmDelete ? (
              <div className="confirm-row">
                <span>Retirer cet élève ?</span>
                <button type="button" className="btn btn-danger" onClick={onDelete}>
                  Retirer
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}>
                Retirer l'élève
              </button>
            )
          ) : (
            <span />
          )}
          <div className="foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              Enregistrer
            </button>
            {onSaveAnother ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSave}
                onClick={() => {
                  if (canSave) onSaveAnother();
                }}
              >
                En ajouter un autre
              </button>
            ) : null}
          </div>
        </footer>
      </form>
    </div>
  );
}
