import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types/api';

const KEY = 'alpinefilm.session';
export const saveSession = (session: Session) => SecureStore.setItemAsync(KEY, JSON.stringify(session));
export async function readSession(): Promise<Session | null> { const value = await SecureStore.getItemAsync(KEY); return value ? JSON.parse(value) as Session : null; }
export const clearSession = () => SecureStore.deleteItemAsync(KEY);
