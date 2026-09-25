import { resumePosition } from "../playback/progress";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { api, messageOf } from "../api/client";
import type { Movie, Progress, Session } from "../types/api";
import { colors } from "../theme/colors";
import { styles } from "../theme/styles";
import { Poster } from "./Poster";
import { Button, ErrorText } from "./ui";
export type CatalogTab = "home" | "search" | "saved";
export function Catalog({
  session,
  open,
  play,
  profile,
  admin,
  tab,
  setTab,
}: {
  session: Session;
  open: (m: Movie) => void;
  play: (m: Movie) => void;
  profile: () => void;
  admin: () => void;
  tab: CatalogTab;
  setTab: (t: CatalogTab) => void;
}) {
  const [query, setQuery] = useState(""),
    [movies, setMovies] = useState<Movie[]>([]),
    [progress, setProgress] = useState<Progress[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [saved, setSaved] = useState<Movie[]>([]),
    [saving, setSaving] = useState(false);
  const serial = useRef(0),
    loading = useRef(false),
    list = useRef<FlatList<Movie>>(null);
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const columns = width >= 700 ? 4 : 2;
  const load = useCallback(
    async (next = 1) => {
      const id = ++serial.current;
      loading.current = true;
      setBusy(true);
      setError(undefined);
      try {
        const result =
          tab === "saved"
            ? { data: await api.favorites(), meta: { totalPages: 1 } }
            : await api.movies(tab === "search" ? query : "", next);
        if (id !== serial.current) return;
        setMovies((old) =>
          next === 1 ? result.data : [...old, ...result.data],
        );
        setPage(next);
        setPages(result.meta.totalPages);
        if (next === 1 && tab === "home") {
          const [p, f] = await Promise.all([api.progress(), api.favorites()]);
          if (id === serial.current) {
            setProgress(
              p.filter(
                (v) =>
                  resumePosition(
                    v.positionSeconds,
                    v.movie.durationSeconds ?? v.durationSeconds,
                    v.completed,
                  ) > 0,
              ),
            );
            setSaved(f);
          }
        }
      } catch (e) {
        if (id === serial.current) setError(messageOf(e));
      } finally {
        if (id === serial.current) {
          setBusy(false);
          loading.current = false;
        }
      }
    },
    [tab, query],
  );
  useEffect(() => {
    setMovies([]);
    setPages(1);
    list.current?.scrollToOffset({ offset: 0, animated: false });
    const timer = setTimeout(() => void load(), tab === "search" ? 250 : 0);
    return () => {
      clearTimeout(timer);
      serial.current++;
    };
  }, [load]);
  const featured = movies.find((m) => m.status === "published");
  const isSaved = !!featured && saved.some((m) => m.id === featured.id);
  async function toggle() {
    if (!featured) return;
    setSaving(true);
    try {
      await api.favorite(featured.id, !isSaved);
      setSaved((old) =>
        isSaved ? old.filter((m) => m.id !== featured.id) : [...old, featured],
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        ref={list}
        key={columns}
        data={movies}
        numColumns={columns}
        columnWrapperStyle={{ gap: 14 }}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 112 + insets.bottom,
          maxWidth: 1000,
          width: "100%",
          alignSelf: "center",
        }}
        refreshing={busy && page === 1}
        onRefresh={() => void load()}
        onEndReached={() => {
          if (!loading.current && page < pages) void load(page + 1);
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <View>
                <Text style={s.brand}>
                  ALPINE<Text style={{ color: colors.accent }}>FILM</Text>
                </Text>
                <Text style={s.subtitle}>
                  {tab === "home"
                    ? "Tu próxima gran historia."
                    : tab === "search"
                      ? "Encuentra algo para hoy."
                      : "Historias que quieres ver."}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir perfil"
                onPress={profile}
                style={s.avatar}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 18,
                  }}
                >
                  {(session.user.displayName || session.user.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              </Pressable>
            </View>
            {tab === "search" ? (
              <View style={s.search}>
                <Ionicons
                  name="search-outline"
                  size={22}
                  color={colors.muted}
                />
                <TextInput
                  accessibilityLabel="Buscar por título"
                  placeholder="Busca una película"
                  placeholderTextColor={colors.muted}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  returnKeyType="search"
                  style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: 16,
                    minHeight: 52,
                  }}
                />
                {query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Borrar búsqueda"
                    onPress={() => setQuery("")}
                    style={s.iconTouch}
                  >
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={colors.muted}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <ErrorText message={error} />
            {error ? (
              <Button
                title="Reintentar"
                secondary
                onPress={() => void load()}
              />
            ) : null}
            {tab === "home" && featured ? (
              <View
                style={[
                  s.hero,
                  { height: width >= 700 ? 500 : Math.min(510, width * 1.2) },
                ]}
              >
                <Poster
                  movie={featured}
                  style={[
                    StyleSheet.absoluteFill,
                    { width: "100%", height: "100%", aspectRatio: undefined },
                  ]}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    "transparent",
                    "rgba(8,8,12,0.28)",
                    "rgba(8,8,12,0.98)",
                  ]}
                  locations={[0, 0.4, 1]}
                  style={[
                    StyleSheet.absoluteFill,
                    { width: "100%", height: "100%", aspectRatio: undefined },
                  ]}
                />
                <View pointerEvents="box-none" style={s.heroContent}>
                  <Text style={s.kicker}>DE TU BIBLIOTECA</Text>
                  <Text style={s.heroTitle} numberOfLines={3}>
                    {featured.title}
                  </Text>
                  <Text style={s.heroMeta}>
                    {[featured.year, ...featured.genres.slice(0, 2)]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 10, marginTop: 20 }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => play(featured)}
                      style={({ pressed }) => [
                        s.play,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons name="play" size={18} color="#fff" />
                      <Text style={s.playText}>Reproducir</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        isSaved ? "Quitar de mi lista" : "Añadir a mi lista"
                      }
                      accessibilityState={{
                        selected: isSaved,
                        disabled: saving,
                      }}
                      disabled={saving}
                      onPress={() => void toggle()}
                      style={s.heroIcon}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons
                          name={isSaved ? "checkmark" : "add"}
                          size={25}
                          color="#fff"
                        />
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Información de la película"
                      onPress={() => open(featured)}
                      style={s.heroIcon}
                    >
                      <Ionicons
                        name="information-outline"
                        size={25}
                        color="#fff"
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
            {tab === "home" && progress.length > 0 ? (
              <>
                <Text style={s.section}>Continuar viendo</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
                >
                  {progress.map((p) => (
                    <Pressable
                      key={p.movieId}
                      accessibilityRole="button"
                      accessibilityLabel={`Continuar ${p.movie.title}`}
                      onPress={() => play(p.movie)}
                      style={{
                        width: 230,
                        backgroundColor: colors.panel,
                        borderRadius: 22,
                        overflow: "hidden",
                      }}
                    >
                      <Poster
                        movie={p.movie}
                        style={{
                          height: 125,
                          aspectRatio: undefined,
                          borderRadius: 0,
                        }}
                      />
                      <View style={{ padding: 14 }}>
                        <Text numberOfLines={1} style={styles.cardTitle}>
                          {p.movie.title}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {Math.floor(p.positionSeconds / 60)} de{" "}
                          {Math.ceil(p.durationSeconds / 60)} min
                        </Text>
                        <View style={styles.track}>
                          <View
                            style={[
                              styles.fill,
                              {
                                width: `${Math.max(0, Math.min(100, (p.positionSeconds / Math.max(1, p.durationSeconds)) * 100))}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <View style={s.sectionRow}>
              <Text style={s.section}>
                {tab === "home"
                  ? "Tu biblioteca"
                  : tab === "saved"
                    ? "Mi lista"
                    : query
                      ? "Resultados"
                      : "Explorar películas"}
              </Text>
              {session.user.role === "admin" && tab === "home" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={admin}
                  style={{ minHeight: 48, justifyContent: "center" }}
                >
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    Administrar ↗
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver ${item.title}`}
            onPress={() => open(item)}
            style={({ pressed }) => [
              {
                flex: 1,
                maxWidth: `${100 / columns - 2}%`,
                marginBottom: 24,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Poster movie={item} />
            <Text
              numberOfLines={2}
              style={[styles.cardTitle, { lineHeight: 21 }]}
            >
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.cardMeta}>
              {[item.year, item.genres[0]].filter(Boolean).join(" · ") ||
                "Película"}
              {item.status !== "published" ? " · Borrador" : ""}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          busy ? (
            <View style={s.empty}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.copy}>Cargando películas…</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons
                name={tab === "saved" ? "bookmark-outline" : "film-outline"}
                size={36}
                color={colors.accent}
              />
              <Text style={[styles.cardTitle, { fontSize: 20, marginTop: 16 }]}>
                {tab === "saved"
                  ? "Tu lista empieza aquí"
                  : query
                    ? "Sin coincidencias"
                    : "Tu cine está por comenzar"}
              </Text>
              <Text style={[styles.copy, { textAlign: "center" }]}>
                {tab === "saved"
                  ? "Guarda una película con + y encuéntrala aquí."
                  : query
                    ? "Prueba otro título o borra la búsqueda."
                    : "Las películas de tu servidor aparecerán aquí."}
              </Text>
              {query ? (
                <Button
                  title="Borrar búsqueda"
                  secondary
                  onPress={() => setQuery("")}
                />
              ) : null}
              {session.user.role === "admin" && tab === "home" ? (
                <Button title="Agregar una película" onPress={admin} />
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          busy && page > 1 ? <ActivityIndicator color={colors.accent} /> : null
        }
      />
      <View style={[s.dock, { bottom: Math.max(insets.bottom, 12) }]}>
        {(
          [
            { id: "home", label: "Inicio", icon: "home-outline" },
            { id: "search", label: "Buscar", icon: "search-outline" },
            { id: "saved", label: "Mi lista", icon: "bookmark-outline" },
            { id: "profile", label: "Perfil", icon: "person-outline" },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => (t.id === "profile" ? profile() : setTab(t.id))}
            style={[s.tab, tab === t.id && { backgroundColor: colors.accent }]}
          >
            <Ionicons
              name={t.icon}
              color={tab === t.id ? "#fff" : colors.secondary}
              size={21}
            />
            <Text
              style={{
                color: tab === t.id ? "#fff" : colors.secondary,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    gap: 12,
  },
  brand: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 7 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  hero: {
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: colors.panel,
    justifyContent: "flex-end",
  },
  heroContent: { padding: 24 },
  kicker: { fontSize: 10, color: "#ddd", fontWeight: "700", letterSpacing: 2 },
  heroTitle: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800",
    color: "#fff",
    marginTop: 12,
  },
  heroMeta: { fontSize: 13, color: "#ddd", marginTop: 10 },
  play: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 18,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 8,
  },
  playText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  heroIcon: {
    width: 52,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#ffffff24",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginTop: 30,
    marginBottom: 18,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  search: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTouch: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    padding: 28,
    backgroundColor: colors.panel,
    borderRadius: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  dock: {
    position: "absolute",
    alignSelf: "center",
    width: "88%",
    maxWidth: 440,
    flexDirection: "row",
    padding: 7,
    gap: 4,
    borderRadius: 32,
    backgroundColor: "#232329",
    borderWidth: 1,
    borderColor: "#ffffff15",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
  },
  tab: {
    flex: 1,
    minHeight: 56,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});
