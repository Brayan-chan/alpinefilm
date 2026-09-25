import { useEffect, useRef, useState } from "react";
import { Alert, Text, View, Pressable, ScrollView } from "react-native";
import { pickFile } from "../files/pickFile";
import { attachmentBody, posterType } from "../files/multipart";
import { Poster } from "./Poster";
import { FileMode } from "expo-file-system";
import { api, ApiError, messageOf } from "../api/client";
import type { Movie, Upload, User } from "../types/api";
import { colors } from "../theme/colors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { styles } from "../theme/styles";
import { Button, ErrorText, Field, Page } from "./ui";
export function Admin({ back }: { back: () => void }) {
  const [section, setSection] = useState<
    "library" | "new" | "uploads" | "users"
  >("library");
  const [transferring, setTransferring] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const [movies, setMovies] = useState<Movie[]>([]),
    [uploads, setUploads] = useState<Upload[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [free, setFree] = useState<number>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Movie | null>(null),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [year, setYear] = useState(""),
    [genres, setGenres] = useState(""),
    [username, setUsername] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [password, setPassword] = useState(""),
    [language, setLanguage] = useState("es"),
    [subtitleLabel, setSubtitleLabel] = useState("Español");
  const paused = useRef(false),
    alive = useRef(true);
  async function reload() {
    const [first, u, s, people] = await Promise.all([
      api.movies(),
      api.uploads(),
      api.storage(),
      api.users(),
    ]);
    let all = first.data;
    for (let page = 2; page <= first.meta.totalPages; page++)
      all = all.concat((await api.movies("", page)).data);
    if (alive.current) {
      setMovies(all);
      setUploads(u);
      setFree(s.freeBytes);
      setUsers(people);
    }
  }
  useEffect(() => {
    alive.current = true;
    void reload().catch((e) => setError(messageOf(e)));
    return () => {
      alive.current = false;
      paused.current = true;
    };
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await fn();
      if (alive.current) await reload();
    } catch (e) {
      if (alive.current) {
        setNotice("");
        setError(
          e instanceof ApiError
            ? `${e.message} (${e.code}, HTTP ${e.status})`
            : messageOf(e),
        );
        await reload().catch(() => {});
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function edit(m: Movie | null) {
    if (m) setSection("new");
    setEditing(m);
    setTitle(m?.title ?? "");
    setDescription(m?.description ?? "");
    setYear(m?.year?.toString() ?? "");
    setGenres(m?.genres.join(", ") ?? "");
  }
  async function save() {
    const input = {
      title: title.trim(),
      description,
      year: year ? Number(year) : null,
      genres: genres
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (!input.title || (year && !Number.isInteger(input.year)))
      throw new Error("Revisa el título y el año.");
    if (editing) await api.editMovie(editing.id, input);
    else await api.createMovie(input);
    edit(null);
    setSection("library");
    setNotice("Ficha guardada. Selecciona su video en la lista.");
  }
  async function uploadVideo(m: Movie, pending?: Upload) {
    setNotice("Preparando una copia del video en el teléfono…");
    const selected = await pickFile("video/mp4");
    if (!selected) {
      setNotice("");
      return;
    }
    const { file, size, name } = selected;
    let handle: ReturnType<typeof file.open> | undefined;
    let upload: Upload;
    try {
      if (pending && (size !== pending.fileSize || name !== pending.fileName))
        throw new Error(
          "Para reanudar selecciona el mismo archivo, con el mismo nombre y tamaño.",
        );
      handle = file.open(FileMode.ReadOnly);
      upload = pending
        ? await api.upload(pending.uploadId)
        : await api.createUpload(m.id, name, size);
      paused.current = false;
      setTransferring(true);
      let offset = upload.offset;
      while (offset < size) {
        if (paused.current) {
          setNotice(
            "Subida pausada. Puedes reanudar seleccionando el mismo archivo.",
          );
          return;
        }
        handle.offset = offset;
        const bytes = handle.readBytes(
          Math.min(upload.chunkSize, size - offset),
        );
        if (bytes.length === 0)
          throw new Error("No se pudo leer el siguiente fragmento.");
        const next = await api.uploadChunk(upload.uploadId, offset, bytes);
        if (next !== offset + bytes.length)
          throw new Error(
            "El servidor devolvió un offset inesperado. Reanuda la subida.",
          );
        offset = next;
        if (alive.current)
          setNotice(
            `Subiendo ${m.title}: ${Math.round((offset / size) * 100)}%`,
          );
      }
      if (paused.current) return;
      setTransferring(false);
      setNotice(
        "Preparando el video en el servidor. Puede tardar varios minutos…",
      );
      await api.completeUpload(upload.uploadId);
      setNotice("Video listo. Ya puedes publicar la película.");
    } finally {
      setTransferring(false);
      handle?.close();
      selected.dispose();
    }
  }
  async function attachment(m: Movie, kind: "poster" | "subtitle") {
    const selected = await pickFile(kind === "poster" ? "image/*" : "*/*");
    if (!selected) return;
    try {
      const config = await api.config();
      const limit =
        kind === "poster" ? config.maxPosterBytes : config.maxSubtitleBytes;
      if (selected.size > limit)
        throw new Error(
          `El archivo supera el límite de ${(limit / 1024 ** 2).toFixed(1)} MB.`,
        );
      const bytes = await selected.file.bytes();
      const type = kind === "poster" ? posterType(bytes) : "text/vtt";
      const form = attachmentBody(
        kind,
        selected.name,
        type,
        bytes,
        kind === "subtitle" ? { language, label: subtitleLabel } : {},
      );
      setNotice(
        kind === "poster" ? "Subiendo portada…" : "Subiendo subtítulo…",
      );
      if (kind === "poster") {
        const saved = await api.poster(m.id, form);
        if (!saved.posterUrl)
          throw new Error(
            "El servidor no confirmó la portada. Actualiza la biblioteca.",
          );
        setMovies((previous) =>
          previous.map((item) => (item.id === saved.id ? saved : item)),
        );
        setNotice("Portada guardada. Puedes comprobarla en la vista previa.");
      } else {
        await api.uploadSubtitle(m.id, form);
        setNotice("Subtítulo guardado.");
      }
    } finally {
      selected.dispose();
    }
  }

  function confirm(title: string, action: () => Promise<unknown>) {
    Alert.alert(title, "Esta acción modificará el servidor.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        style: "destructive",
        onPress: () => void run(action),
      },
    ]);
  }
  return (
    <Page
      title="Administrar"
      onBack={() => {
        paused.current = true;
        back();
      }}
    >
      <Text style={styles.copy}>
        {movies.length} películas ·{" "}
        {free === undefined
          ? "Consultando disco…"
          : `${(free / 1024 ** 3).toFixed(1)} GB libres`}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 20 }}
      >
        {(
          [
            { id: "library", label: "Películas" },
            { id: "new", label: "Agregar" },
            { id: "uploads", label: "Subidas" },
            { id: "users", label: "Usuarios" },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === t.id, disabled: busy }}
            disabled={busy}
            onPress={() => setSection(t.id)}
            style={{
              paddingHorizontal: 18,
              minHeight: 46,
              borderRadius: 23,
              justifyContent: "center",
              backgroundColor: section === t.id ? colors.accent : colors.panel,
            }}
          >
            <Text
              style={{
                color: section === t.id ? "#fff" : colors.secondary,
                fontWeight: "600",
              }}
            >
              {t.label}
              {t.id === "uploads" && uploads.length > 0
                ? ` (${uploads.length})`
                : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ErrorText message={error} />
      {notice ? <Text style={styles.copy}>{notice}</Text> : null}
      <Button
        title="Actualizar"
        secondary
        disabled={busy}
        onPress={() => void run(reload)}
      />
      {transferring && (
        <Button
          title="Pausar subida después del fragmento actual"
          secondary
          onPress={() => {
            paused.current = true;
          }}
        />
      )}
      {section === "new" && (
        <View style={styles.info}>
          <Text style={styles.sectionTitle}>
            {editing ? "Editar película" : "Agregar película"}
          </Text>
          <Field label="Título" value={title} onChange={setTitle} />
          <Field
            label="Descripción"
            value={description}
            onChange={setDescription}
          />
          <Field
            label="Año (opcional)"
            value={year}
            onChange={setYear}
            numeric
          />
          <Field
            label="Géneros separados por comas"
            value={genres}
            onChange={setGenres}
          />
          <Button
            title="Guardar ficha"
            busy={busy}
            onPress={() => void run(save)}
          />
          {editing && (
            <Button
              title="Cancelar edición"
              secondary
              disabled={busy}
              onPress={() => edit(null)}
            />
          )}
        </View>
      )}
      {section === "uploads" && (
        <>
          <Text style={styles.sectionTitle}>Subidas pendientes</Text>
          {uploads.length === 0 && (
            <Text style={styles.cardMeta}>No hay subidas pendientes.</Text>
          )}
          {uploads.map((u) => (
            <View key={u.uploadId} style={styles.info}>
              <Text style={styles.cardTitle}>{u.fileName}</Text>
              <Text style={styles.cardMeta}>
                {Math.round((u.offset / u.fileSize) * 100)}% · caduca{" "}
                {new Date(u.expiresAt).toLocaleString()}
              </Text>
              <Button
                title={
                  u.offset === u.fileSize
                    ? "Validar y finalizar"
                    : "Seleccionar el mismo archivo y reanudar"
                }
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    if (u.offset === u.fileSize) {
                      setNotice(
                        "Preparando el video en el servidor. Puede tardar varios minutos…",
                      );
                      await api.completeUpload(u.uploadId);
                      setNotice("Video listo. Ya puedes publicar la película.");
                      return;
                    }
                    const m = movies.find((m) => m.id === u.movieId);
                    if (!m) throw new Error("Actualiza la biblioteca.");
                    return uploadVideo(m, u);
                  })
                }
              />
              <Button
                title="Cancelar subida"
                secondary
                disabled={busy}
                onPress={() =>
                  confirm("¿Cancelar la subida?", () =>
                    api.cancelUpload(u.uploadId),
                  )
                }
              />
            </View>
          ))}
        </>
      )}
      {section === "library" && (
        <>
          <Text style={styles.sectionTitle}>Biblioteca</Text>
          <Text style={styles.cardMeta}>
            Selecciona tu video MP4; el servidor lo prepara si es necesario. La
            app debe permanecer abierta. Se crea una copia temporal en el
            teléfono; necesitas espacio libre para el video.
          </Text>
          {movies.map((m) => (
            <View key={m.id} style={styles.info}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Administrar ${m.title}`}
                accessibilityState={{ expanded: expanded === m.id }}
                onPress={() =>
                  setExpanded(expanded === m.id ? undefined : m.id)
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <View style={{ width: 64 }}>
                  <Poster movie={m} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{m.title}</Text>
                  <Text style={styles.cardMeta}>
                    {
                      {
                        draft: "Borrador",
                        uploading: "Subiendo",
                        published: "Publicada",
                        hidden: "Oculta",
                        error: "Revisar",
                      }[m.status]
                    }
                  </Text>
                  <Text style={styles.cardMeta}>
                    {m.durationSeconds
                      ? `${Math.round(m.durationSeconds / 60)} min`
                      : "Sin video validado"}
                  </Text>
                </View>
                <Ionicons
                  name={expanded === m.id ? "chevron-up" : "chevron-down"}
                  color={colors.secondary}
                  size={20}
                />
              </Pressable>
              {expanded === m.id && (
                <>
                  <Button
                    title="Editar ficha"
                    secondary
                    disabled={busy}
                    onPress={() => edit(m)}
                  />
                  <Button
                    title="Seleccionar video"
                    disabled={busy || uploads.some((u) => u.movieId === m.id)}
                    onPress={() => void run(() => uploadVideo(m))}
                  />
                  <Button
                    title="Subir portada"
                    secondary
                    disabled={busy}
                    onPress={() => void run(() => attachment(m, "poster"))}
                  />
                  <Field
                    label="Idioma para subir subtítulos"
                    value={language}
                    onChange={setLanguage}
                  />
                  <Field
                    label="Nombre del subtítulo"
                    value={subtitleLabel}
                    onChange={setSubtitleLabel}
                  />
                  <Button
                    title="Subir subtítulo VTT"
                    secondary
                    disabled={busy}
                    onPress={() => void run(() => attachment(m, "subtitle"))}
                  />
                  <Button
                    title={m.status === "published" ? "Ocultar" : "Publicar"}
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        api.publish(m.id, m.status !== "published"),
                      )
                    }
                  />
                  <Button
                    title="Eliminar película y archivos"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      confirm(`¿Eliminar ${m.title}?`, () =>
                        api.deleteMovie(m.id),
                      )
                    }
                  />
                </>
              )}
            </View>
          ))}
        </>
      )}
      {section === "users" && (
        <>
          <Text style={styles.sectionTitle}>Crear usuario</Text>
          <Field label="Usuario" value={username} onChange={setUsername} />
          <Field label="Nombre" value={displayName} onChange={setDisplayName} />
          <Field
            label="Contraseña inicial"
            value={password}
            onChange={setPassword}
            secret
          />
          <Button
            title="Crear espectador"
            busy={busy}
            onPress={() =>
              void run(async () => {
                await api.createUser({
                  username,
                  displayName,
                  password,
                  role: "viewer",
                });
                setUsername("");
                setDisplayName("");
                setPassword("");
              })
            }
          />
          <Text style={styles.sectionTitle}>Usuarios</Text>
          {users.map((u) => (
            <View key={u.id} style={styles.info}>
              <Text style={styles.cardTitle}>
                {u.displayName ?? u.username}
              </Text>
              <Text style={styles.cardMeta}>
                {u.username} · {u.role} · {u.active ? "Activo" : "Inactivo"}
              </Text>
              <Button
                title={u.active ? "Desactivar" : "Reactivar"}
                secondary
                disabled={busy}
                onPress={() =>
                  confirm(
                    `¿${u.active ? "Desactivar" : "Reactivar"} a ${u.username}?`,
                    () =>
                      u.active
                        ? api.deactivateUser(u.id)
                        : api.editUser(u.id, { active: true }),
                  )
                }
              />
            </View>
          ))}
        </>
      )}
    </Page>
  );
}
