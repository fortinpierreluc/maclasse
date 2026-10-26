import { useEffect } from 'react';
import type { PlacementIssue } from '../autoplace';

export function PlacementDialog({ issues, onClose }: { issues: PlacementIssue[]; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal placement-modal"
        role="alertdialog"
        aria-labelledby="placement-dialog-title"
        aria-describedby="placement-dialog-lead"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Placer les élèves</p>
            <h2 id="placement-dialog-title">Le placement n’est pas possible</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <p id="placement-dialog-lead" className="placement-lead">
          Aucun élève n’a été déplacé. Faites {issues.length > 1 ? 'ces corrections' : 'cette correction'}, puis relancez le placement.
        </p>

        <ol className="placement-issues">
          {issues.map((issue) => (
            <li key={issue.title}>
              <strong>{issue.title}</strong>
              <p>{issue.detail}</p>
              {issue.pairs && issue.pairs.length > 0 ? (
                <ul className="placement-pairs">
                  {issue.pairs.map(([a, b]) => (
                    <li key={`${a.id}:${b.id}`}>
                      <strong>{a.firstName || a.lastName}</strong> et <strong>{b.firstName || b.lastName}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>

        <footer className="modal-foot">
          <span />
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            Compris
          </button>
        </footer>
      </div>
    </div>
  );
}
