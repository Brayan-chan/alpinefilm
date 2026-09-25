import { clearSession, readSession, saveSession } from "../auth/session";
import type {
  Movie,
  MovieInput,
  Page,
  Progress,
  Session,
  Upload,
  User,
} from "../types/api";
const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
let session: Session | null = null;
let listener: ((value: Session | null) => void) | undefined;
let refreshing: Promise<Session> | null = null;
let generation = 0;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado.";
function checkUrl() {
  if (!/^https?:\/\//.test(baseUrl))
    throw new Error("Configura EXPO_PUBLIC_API_URL en .env y reinicia Expo.");
}
export function mediaUrl(relative: string) {
  checkUrl();
  const url = new URL(relative, `${new URL(baseUrl).origin}/`);
  if (url.origin !== new URL(baseUrl).origin)
    throw new Error("El recurso pertenece a otro servidor.");
  return url.toString();
}
export function imageSource(relative: string): {
  uri: string;
  headers: Record<string, string>;
} {
  return {
    uri: mediaUrl(relative),
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  };
}
function validateSession(s: Session) {
  if (
    !s?.accessToken ||
    !s.refreshToken ||
    !s.user?.id ||
    !["admin", "viewer"].includes(s.user.role)
  )
    throw new Error("La API devolvió una sesión inválida.");
  return s;
}
async function persist(next: Session | null) {
  if (next) await saveSession(next);
  else await clearSession();
  session = next;
  listener?.(next);
}
async function raw(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  checkUrl();
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error("El servidor tardó demasiado. Comprueba tu conexión.");
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba la red y Tailscale.",
    );
  } finally {
    clearTimeout(timer);
  }
}
async function decode<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "El servidor no devolvió una respuesta válida.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.error?.code ?? "API_ERROR",
      payload.error?.message ?? `Error ${response.status}`,
    );
  return payload;
}
async function renew() {
  if (!refreshing) {
    const current = session,
      epoch = generation;
    const promise = (async () => {
      if (!current) throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión.");
      try {
        const r = await raw("/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        const { data } = await decode<{ data: Session }>(r);
        if (epoch !== generation)
          throw new ApiError(401, "SESSION_CHANGED", "La sesión cambió.");
        await persist(validateSession(data));
        return data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && epoch === generation)
          await persist(null);
        throw e;
      }
    })();
    refreshing = promise;
    void promise
      .finally(() => {
        if (refreshing === promise) refreshing = null;
      })
      .catch(() => {});
  }
  return refreshing;
}
async function response(
  path: string,
  init: RequestInit = {},
  protectedRoute = true,
  timeoutMs = 15000,
) {
  const token = session?.accessToken;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && typeof init.body === "string")
    headers.set("Content-Type", "application/json");
  if (protectedRoute && token) headers.set("Authorization", `Bearer ${token}`);
  let r = await raw(path, { ...init, headers }, timeoutMs);
  if (r.status === 401 && protectedRoute && session) {
    if (session.accessToken === token) await renew();
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión.");
    headers.set("Authorization", `Bearer ${session.accessToken}`);
    r = await raw(path, { ...init, headers }, timeoutMs);
    if (r.status === 401) await persist(null);
  }
  return r;
}
async function request<T>(
  path: string,
  init: RequestInit = {},
  protectedRoute = true,
  timeoutMs = 15000,
) {
  return (
    await decode<{ data: T }>(
      await response(path, init, protectedRoute, timeoutMs),
    )
  )?.data;
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const api = {
  baseUrl,
  subscribe(callback: (s: Session | null) => void) {
    listener = callback;
    return () => {
      listener = undefined;
    };
  },
  async restore() {
    session = await readSession();
    if (!session) return null;
    const user = await request<User>("/auth/me");
    await persist({ ...session!, user });
    return session;
  },
  refreshSession: () => renew(),
  genres: () => request<string[]>("/genres"),
  user: (id: string) => request<User>(`/admin/users/${id}`),
  health: () => request<{ ok: boolean }>("/health", {}, false),
  async login(username: string, password: string) {
    generation++;
    const s = validateSession(
      await request<Session>(
        "/auth/login",
        json("POST", { username, password }),
        false,
      ),
    );
    await persist(s);
    return s;
  },
  async register(input: {
    username: string;
    displayName: string;
    password: string;
    inviteCode: string;
  }) {
    generation++;
    const s = validateSession(
      await request<Session>("/auth/register", json("POST", input), false),
    );
    await persist(s);
    return s;
  },
  async logout(all = false) {
    if (session) {
      if (all) await request<void>("/auth/logout-all", json("POST"));
      else
        await request<void>(
          "/auth/logout",
          json("POST", { refreshToken: session.refreshToken }),
          false,
        );
    }
    generation++;
    await persist(null);
  },
  async forgetSession() {
    generation++;
    await persist(null);
  },
  async password(currentPassword: string, newPassword: string) {
    await request<void>(
      "/auth/password",
      json("PATCH", { currentPassword, newPassword }),
    );
    generation++;
    await persist(null);
  },
  movies: async (search = "", page = 1) =>
    decode<Page<Movie>>(
      await response(
        `/movies?search=${encodeURIComponent(search)}&page=${page}`,
      ),
    ),
  movie: (id: string) => request<Movie>(`/movies/${id}`),
  progress: () => request<Progress[]>("/me/progress"),
  favorites: () => request<Movie[]>("/me/favorites"),
  favorite: (id: string, add: boolean) =>
    request<void>(`/movies/${id}/favorite`, json(add ? "POST" : "DELETE")),
  saveProgress: (
    id: string,
    positionSeconds: number,
    durationSeconds: number,
    completed = false,
  ) =>
    request<Progress>(
      `/movies/${id}/progress`,
      json("PUT", { positionSeconds, durationSeconds, completed }),
    ),
  resetProgress: (id: string) =>
    request<void>(`/movies/${id}/progress`, json("DELETE")),
  playback: (id: string) =>
    request<{ streamUrl: string; expiresAt: string }>(
      `/movies/${id}/playback-token`,
      json("POST"),
    ),
  createMovie: (input: MovieInput) =>
    request<Movie>("/admin/movies", json("POST", input)),
  editMovie: (id: string, input: MovieInput) =>
    request<Movie>(`/admin/movies/${id}`, json("PATCH", input)),
  publish: (id: string, publish: boolean) =>
    request<Movie>(
      `/admin/movies/${id}/${publish ? "publish" : "unpublish"}`,
      json("POST"),
    ),
  deleteMovie: (id: string) =>
    request<void>(`/admin/movies/${id}`, json("DELETE")),
  uploads: () => request<Upload[]>("/admin/uploads"),
  upload: (id: string) => request<Upload>(`/admin/uploads/${id}`),
  createUpload: (movieId: string, fileName: string, fileSize: number) =>
    request<Upload>(
      "/admin/uploads",
      json("POST", { movieId, fileName, fileSize, mimeType: "video/mp4" }),
    ),
  async uploadChunk(
    id: string,
    offset: number,
    bytes: Uint8Array<ArrayBuffer>,
  ) {
    const r = await response(
      `/admin/uploads/${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
          "Content-Length": String(bytes.byteLength),
        },
        body: bytes.buffer,
      },
      true,
      120000,
    );
    if (!r.ok) await decode(r);
    return Number(r.headers.get("Upload-Offset"));
  },
  completeUpload: (id: string) =>
    request(`/admin/uploads/${id}/complete`, json("POST"), true, 35 * 60_000),
  cancelUpload: (id: string) =>
    request<void>(`/admin/uploads/${id}`, json("DELETE")),
  poster: (
    id: string,
    form: FormData | { body: ArrayBuffer; headers: Record<string, string> },
  ) =>
    request<Movie>(
      `/admin/movies/${id}/poster`,
      { method: "POST", ...(form instanceof FormData ? { body: form } : form) },
      true,
      60000,
    ),
  async posterSource(id: string) {
    // Images use the same authenticated request and refresh handling as JSON.
    // The native Image loader receives local bytes, never a stale bearer token.
    const result = await response(`/movies/${id}/poster`);
    if (!result.ok) await decode(result);
    const type = (result.headers.get("Content-Type") ?? "").split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type))
      throw new Error("El servidor no devolvió una portada JPEG, PNG o WebP.");
    const bytes = new Uint8Array(await result.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { uri: `data:${type};base64,${btoa(binary)}` };
  },
  subtitles: (id: string) =>
    request<{ id: string; label: string; language: string; url: string }[]>(
      `/movies/${id}/subtitles`,
    ),
  uploadSubtitle: (
    id: string,
    form: FormData | { body: ArrayBuffer; headers: Record<string, string> },
  ) =>
    request(`/admin/movies/${id}/subtitles`, {
      method: "POST",
      ...(form instanceof FormData ? { body: form } : form),
    }),
  config: () =>
    request<{
      chunkSize: number;
      maxVideoBytes: number;
      maxPosterBytes: number;
      maxSubtitleBytes: number;
      videoFormat: string;
    }>("/config"),
  storage: () =>
    request<{ totalBytes: number; freeBytes: number; usedBytes: number }>(
      "/storage",
    ),
  users: () => request<User[]>("/admin/users"),
  createUser: (input: {
    username: string;
    displayName: string;
    password: string;
    role: string;
  }) => request<User>("/admin/users", json("POST", input)),
  editUser: (id: string, input: Partial<User>) =>
    request<User>(`/admin/users/${id}`, json("PATCH", input)),
  deactivateUser: (id: string) =>
    request<void>(`/admin/users/${id}`, json("DELETE")),
  resetPassword: (id: string, password: string) =>
    request<void>(
      `/admin/users/${id}/reset-password`,
      json("POST", { password }),
    ),
};
