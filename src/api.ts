import type { Classroom, ClassSummary } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);
  if (!response.ok) {
    let message = 'La sauvegarde a échoué.';
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error) {
      message = data.error;
    }
    throw new ApiError(message, response.status);
  }
  return data;
}

export function health(): Promise<{ ok: boolean; driver: string }> {
  return request('/api/health');
}

export function listClasses(): Promise<{ classes: ClassSummary[] }> {
  return request('/api/classes');
}

export function getClass(code: string): Promise<Classroom> {
  return request(`/api/classes/${encodeURIComponent(code.trim().toLowerCase())}`);
}

export function createClass(body: Pick<Classroom, 'name' | 'students' | 'furniture' | 'placements'>): Promise<Classroom> {
  return request('/api/classes', { method: 'POST', body: JSON.stringify(body) });
}

export function saveClass(classroom: Classroom): Promise<Classroom> {
  return request(`/api/classes/${encodeURIComponent(classroom.code)}`, {
    method: 'PUT',
    body: JSON.stringify(classroom),
  });
}

export function deleteClass(code: string): Promise<{ ok: boolean }> {
  return request(`/api/classes/${encodeURIComponent(code)}`, { method: 'DELETE' });
}
