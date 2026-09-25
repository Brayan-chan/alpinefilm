import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";

export type DlnaDevice = { id: string; name: string; ip: string };
export type DlnaAction =
  "GetTransportInfo" | "GetPositionInfo" | "Play" | "Pause" | "Stop" | "Seek";
const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        discover(): Promise<DlnaDevice[]>;
        cast(
          id: string,
          source: string,
          title: string,
          expiresAt: number,
        ): Promise<void>;
        renewCast(source: string, expiresAt: number): Promise<void>;
        castStatus(): Promise<{
          active: boolean;
          bytesSent: number;
          error: string;
        }>;
        endCast(): Promise<void>;
        command(
          id: string,
          action: DlnaAction,
          seconds: number,
        ): Promise<Record<string, string>>;
      }>("AlpinefilmDlna")
    : null;
export const dlnaAvailable = !!native;
export async function sendToTV(
  id: string,
  source: string,
  title: string,
  expiresAt: number,
) {
  if (!native)
    throw new Error("Instala el APK actualizado para enviar películas.");
  return native.cast(id, source, title, expiresAt);
}
export async function renewCast(source: string, expiresAt: number) {
  if (!native) throw new Error("DLNA no está disponible.");
  return native.renewCast(source, expiresAt);
}
export async function castStatus() {
  return native?.castStatus();
}
export async function endCast() {
  await native?.endCast();
}
export async function discoverTVs() {
  if (!native)
    throw new Error(
      "El descubrimiento DLNA requiere instalar la compilación Android de AlpineFilm. No está disponible en Expo Go.",
    );
  if (Number(Platform.Version) >= 37) {
    const permission = "android.permission.ACCESS_LOCAL_NETWORK" as Parameters<
      typeof PermissionsAndroid.request
    >[0];
    const result = await PermissionsAndroid.request(permission);
    if (result !== PermissionsAndroid.RESULTS.GRANTED)
      throw new Error("Permite el acceso a la red local para encontrar tu TV.");
  }
  return native.discover();
}
export async function controlTV(id: string, action: DlnaAction, seconds = 0) {
  if (!native) throw new Error("DLNA no está disponible en esta compilación.");
  return native.command(id, action, seconds);
}
