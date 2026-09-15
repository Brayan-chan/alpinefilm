import type { Session } from '../types/api';

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://100.98.115.100:3000/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers }, signal: controller.signal });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const payload = await response.json() as { data: T };
    return payload.data;
  } finally { clearTimeout(timeout); }
}

export const api = {
  baseUrl,
  health: () => request<{ ok: boolean }>('/health'),
  login: (username: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (input: { username: string; displayName: string; password: string; inviteCode: string }) => request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
};
