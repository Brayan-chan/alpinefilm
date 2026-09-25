import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";

// Android grants access to the selected content URI. Copy it natively into
// this project's scoped cache; DocumentPicker's own cache can be outside
// the FileSystem permission scope in Expo Go. Never delete the source.
export async function pickFile(type: string) {
  const result = await DocumentPicker.getDocumentAsync({
    type,
    multiple: false,
    copyToCacheDirectory: Platform.OS !== "android",
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const file =
    Platform.OS === "android"
      ? new File(
          Paths.cache,
          `alpinefilm-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
        )
      : new File(asset.uri);
  const dispose = () => {
    try {
      if (file.exists) file.delete();
    } catch {
      /* Cache cleanup must not mask upload errors. */
    }
  };
  try {
    if (Platform.OS === "android")
      await copyAsync({ from: asset.uri, to: file.uri });
    const size = file.size;
    if (!file.exists || !size)
      throw new Error(
        "No se pudo copiar el archivo. Comprueba el espacio libre del teléfono y selecciona un archivo descargado.",
      );
    return { file, name: asset.name, mimeType: asset.mimeType, size, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
