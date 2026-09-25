import * as SecureStore from "expo-secure-store";
import type { Session } from "../types/api";
const KEY = "alpinefilm.session";
export const saveSession = (session: Session) =>
  SecureStore.setItemAsync(KEY, JSON.stringify(session));
export async function readSession(): Promise<Session | null> {
  const value = await SecureStore.getItemAsync(KEY);
  if (!value) return null;
  try {
    const s = JSON.parse(value);
    if (
      typeof s.accessToken !== "string" ||
      typeof s.refreshToken !== "string" ||
      typeof s.user?.id !== "string"
    )
      throw new Error();
    return s;
  } catch {
    await clearSession();
    return null;
  }
}
export const clearSession = () => SecureStore.deleteItemAsync(KEY);
