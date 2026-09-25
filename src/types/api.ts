export type UserRole = "admin" | "viewer";
export interface User {
  id: string;
  username: string;
  displayName?: string;
  role: UserRole;
  active?: boolean;
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}
export interface Movie {
  id: string;
  title: string;
  description: string;
  year: number | null;
  durationSeconds: number | null;
  genres: string[];
  posterUrl: string | null;
  contentRating?: string | null;
  status: "draft" | "uploading" | "published" | "hidden" | "error";
  fileSize?: number | null;
}
export interface Progress {
  movieId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  movie: Movie;
}
export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface Upload {
  uploadId: string;
  movieId: string;
  fileName: string;
  fileSize: number;
  offset: number;
  chunkSize: number;
  status: string;
  expiresAt: string;
}
export interface MovieInput {
  title: string;
  description: string;
  year: number | null;
  genres: string[];
  contentRating?: string | null;
}
