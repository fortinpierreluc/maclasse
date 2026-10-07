export function AppleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M34 16c7-9 18-8 20-1-7 1-13 6-15 12-2-4-4-8-5-11z" fill="#6e8f62" />
      <path d="M31 18c1-7 5-12 10-14" fill="none" stroke="#6b4428" strokeWidth="2.6" strokeLinecap="round" />
      <path
        d="M32 22c-11 1-20 9-20 20 0 10 8 18 18 18h4c10 0 18-8 18-18 0-11-9-19-20-20z"
        fill="#d4534a"
      />
      <path d="M32 24c-1 6-1 14 0 22" fill="none" stroke="#b83d36" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      <ellipse cx="24" cy="34" rx="3.2" ry="6" fill="#f4b2a6" opacity="0.85" />
    </svg>
  );
}

export function IconSelect() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 5l6 18 3.2-6.2L24 14z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDesk() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="7" y="6" width="18" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 22h10M16 16v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconTable() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="10" width="20" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 10V7M22 10V7M10 22v3M22 22v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconBureau() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="12" width="24" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12V8h6v4M22 16h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.5" cy="16" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconRow() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="12" width="6" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="12" width="6" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="23" y="12" width="6" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconDoor() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M10 6h12v20H10z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18.5" cy="16" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function IconBoard() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="8" width="24" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 26h16M12 22v4M20 22v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
