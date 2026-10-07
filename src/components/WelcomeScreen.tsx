import { useEffect, useState } from 'react';
import { ApiError, createClass, deleteClass, listClasses } from '../api';
import { exampleClassroom } from '../example';
import { clampFurniture, newId } from '../geometry';
import type { Classroom, ClassSummary } from '../types';
import { ROOM_H, ROOM_W } from '../types';
import { AppleMark } from './Icons';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function Welcome({ driver, onOpen }: { driver: string; onOpen: (classroom: Classroom) => void }) {
  const [name, setName] = useState('Ma classe');
  const [code, setCode] = useState('');
  const [recent, setRecent] = useState<ClassSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClasses()
      .then((result) => {
        if (!cancelled) setRecent(result.classes);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<Classroom>) {
    setBusy(true);
    setError('');
    try {
      onOpen(await action());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'La base ne répond pas. Relancez l’application.');
    } finally {
      setBusy(false);
    }
  }

  async function removeRecent(code: string) {
    setBusy(true);
    setError('');
    try {
      await deleteClass(code);
      setRecent((items) => items.filter((item) => item.code !== code));
      setPendingDelete(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Impossible de supprimer ce plan.');
    } finally {
      setBusy(false);
    }
  }

  const base =
    driver === 'sqlite'
      ? 'Chaque plan est gardé dans une base SQLite sur cet ordinateur. Le code permet de le rouvrir.'
      : driver === 'json'
        ? 'Chaque plan est gardé dans une base locale sur cet ordinateur. Le code permet de le rouvrir.'
        : 'Chaque plan est gardé dans une base locale. Le code permet de le rouvrir plus tard.';

  return (
    <main className="welcome">
      <div className="welcome-card" aria-hidden="true" />
      <div className="welcome-side">
        <header className="welcome-hero">
          <AppleMark className="hero-mark" />
          <div>
            <h1>Ma Classe</h1>
            <p className="lede">Voir d’un coup d’œil qui s’assoit où.</p>
          </div>
        </header>
        <ul className="hero-points">
          <li>Pupitres, tables et bureau, tournés dans le sens voulu.</li>
          <li>Les élèves se glissent d’un siège à l’autre.</li>
          <li>Un lien vert pour les amis, un lien rouge quand ça ne va pas.</li>
        </ul>
      </div>

      <div className="panel-top">
        {offline ? <p className="error-banner">La base de sauvegarde ne répond pas.</p> : null}
        {error ? <p className="error-banner">{error}</p> : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              createClass({
                name: name.trim() || 'Ma classe',
                students: [],
                furniture: [
                  clampFurniture({ id: newId(), kind: 'tableau', x: ROOM_W / 2, y: 58, rotation: 0 }),
                  clampFurniture({ id: newId(), kind: 'porte', x: 28, y: ROOM_H / 2, rotation: 0 }),
                  clampFurniture({ id: newId(), kind: 'bureau', x: 220, y: 188, rotation: 180 }),
                ],
                placements: [],
              }),
            );
          }}
        >
          <h2>Nouvelle classe</h2>
          <label>
            Nom
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="4e année — groupe B" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Créer le plan
          </button>
        </form>
      </div>

      <div className="panel-rest">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = code.trim().toLowerCase();
            if (!trimmed) return;
            void run(async () => {
              const { getClass } = await import('../api');
              return getClass(trimmed);
            });
          }}
        >
          <h2>Reprendre avec un code</h2>
          <label>
            Code du plan
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="tilleul-4821"
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>
          <button type="submit" className="btn btn-ghost" disabled={busy || code.trim().length === 0}>
            Ouvrir
          </button>
          <button type="button" className="btn btn-quiet example-btn" disabled={busy} onClick={() => void run(() => createClass(exampleClassroom()))}>
            Essayer avec un exemple
            <small>24 élèves, 12 filles et 12 garçons, avec quelques amitiés et conflits.</small>
          </button>
        </form>

        {recent.length > 0 ? (
          <div className="recent">
            <h2>Sur cet ordinateur</h2>
            <ul>
              {recent.map((item) => (
                <li key={item.code}>
                  <div className="recent-item">
                    <button
                      type="button"
                      className="recent-open"
                      disabled={busy}
                      onClick={() => void run(async () => (await import('../api')).getClass(item.code))}
                    >
                      <strong>{item.name}</strong>
                      <span>
                        {item.code}
                        {item.updatedAt ? ` · ${formatWhen(item.updatedAt)}` : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="recent-delete"
                      disabled={busy}
                      aria-label={`Supprimer ${item.name}`}
                      title="Supprimer de cet ordinateur"
                      onClick={() => setPendingDelete(pendingDelete === item.code ? null : item.code)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 7h8M9 7V5.5h6V7M7 7l.8 12h8.4L17 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {pendingDelete === item.code ? (
                    <div className="recent-confirm">
                      <p>Ce plan sera effacé de cet ordinateur.</p>
                      <button type="button" disabled={busy} onClick={() => setPendingDelete(null)}>
                        Annuler
                      </button>
                      <button type="button" className="is-danger" disabled={busy} onClick={() => void removeRecent(item.code)}>
                        Supprimer
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="fine">{base}</p>
      </div>
    </main>
  );
}
