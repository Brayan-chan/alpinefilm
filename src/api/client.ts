import type { Session } from '../types/api';

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://100.98.115.100:3000/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers }, signal: controller.signal });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    return await response.json() as T;
  } finally { clearTimeout(timeout); }
}

export const api = {
  baseUrl,
  health: () => request<{ ok: boolean }>('/health'),
  login: (username: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
};
