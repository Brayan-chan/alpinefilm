export type UserRole = 'admin' | 'viewer';
export interface User { id: string; username: string; displayName?: string; role: UserRole }
export interface Session { accessToken: string; refreshToken: string; user: User }
export interface Movie { id: string; title: string; description: string; year: number; durationSeconds: number; genres: string[]; posterUrl: string; progress?: number }
