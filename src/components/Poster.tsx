import { useEffect, useState } from "react";
import {
  Image,
  Text,
  View,
  Pressable,
  type StyleProp,
  type ImageStyle,
} from "react-native";
import { api, ApiError, messageOf } from "../api/client";
import type { Movie } from "../types/api";
import { styles } from "../theme/styles";

export function Poster({
  movie,
  style,
}: {
  movie: Movie;
  style?: StyleProp<ImageStyle>;
}) {
  const [source, setSource] = useState<{ uri: string }>();
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSource(undefined);
    setFailed(false);
    setDetail(undefined);
    if (!movie.posterUrl) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void api
      .posterSource(movie.id)
      .then((value) => {
        if (active) setSource(value);
      })
      .catch((e) => {
        if (active) {
          setFailed(true);
          setDetail(
            e instanceof ApiError
              ? `${e.message} (HTTP ${e.status}, ${e.code})`
              : messageOf(e),
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [movie, attempt]);
  return source && !failed ? (
    <Image
      source={source}
      style={[styles.poster, style]}
      onError={() => setFailed(true)}
      accessibilityLabel={`Portada de ${movie.title}`}
    />
  ) : (
    <View
      style={[
        styles.poster,
        style,
        { alignItems: "center", justifyContent: "center", padding: 8 },
      ]}
    >
      <Text style={styles.cardMeta}>
        {busy
          ? "Cargando portada…"
          : failed
            ? "No se pudo cargar la portada"
            : "Sin portada"}
      </Text>
      {detail ? <Text style={styles.cardMeta}>{detail}</Text> : null}
      {failed ? (
        <Pressable disabled={busy} onPress={() => setAttempt((n) => n + 1)}>
          <Text style={styles.copy}>
            {busy ? "Cargando…" : "Reintentar portada"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
