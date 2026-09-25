import { resumePosition } from "./src/playback/progress";
import { Catalog, type CatalogTab } from "./src/components/Catalog";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Poster } from "./src/components/Poster";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, Text, View } from "react-native";
import { api, ApiError, messageOf } from "./src/api/client";
import type { Movie, Session } from "./src/types/api";
import { colors } from "./src/theme/colors";
import { styles } from "./src/theme/styles";
import { Button, ErrorText, Field, Loading, Page } from "./src/components/ui";
import { Player } from "./src/components/Player";
import { Admin } from "./src/components/Admin";
type Screen = "home" | "details" | "profile" | "admin" | "player";
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
function AppContent() {
  const [tab, setTab] = useState<CatalogTab>("home");
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [bootError, setBootError] = useState<string>(),
    [screen, setScreen] = useState<Screen>("home"),
    [selected, setSelected] = useState<Movie | null>(null),
    [revision, setRevision] = useState(0);
  const restore = useCallback(async () => {
    setBoot(true);
    setBootError(undefined);
    try {
      setSession(await api.restore());
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setBootError(messageOf(e));
    } finally {
      setBoot(false);
    }
  }, []);
  useEffect(() => {
    const unsubscribe = api.subscribe((s) => {
      setSession(s);
      if (!s) setScreen("home");
    });
    void restore();
    return unsubscribe;
  }, [restore]);
  const back = useCallback(() => {
    setScreen("home");
    setRevision((n) => n + 1);
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "home") return false;
      if (screen === "player") {
        setScreen("details");
        setRevision((n) => n + 1);
      } else back();
      return true;
    });
    return () => sub.remove();
  }, [screen, back]);
  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      {boot ? (
        <Loading />
      ) : bootError ? (
        <Page title="Conectar con tu servidor">
          <ErrorText message={bootError} />
          <Button title="Reintentar" onPress={() => void restore()} />
          <Button
            title="Usar otra cuenta"
            secondary
            onPress={() =>
              void api.forgetSession().then(() => setBootError(undefined))
            }
          />
        </Page>
      ) : !session ? (
        <Login />
      ) : screen === "home" ? (
        <Catalog
          key={revision}
          session={session}
          tab={tab}
          setTab={setTab}
          play={(m) => {
            setSelected(m);
            setScreen("player");
          }}
          open={(m) => {
            setSelected(m);
            setScreen("details");
          }}
          profile={() => setScreen("profile")}
          admin={() => setScreen("admin")}
        />
      ) : screen === "profile" ? (
        <Profile session={session} back={back} />
      ) : screen === "admin" && session.user.role === "admin" ? (
        <Admin back={back} />
      ) : screen === "player" && selected ? (
        <Player
          movie={selected}
          back={() => {
            setScreen("details");
            setRevision((n) => n + 1);
          }}
        />
      ) : selected ? (
        <Details
          key={`${selected.id}-${revision}`}
          movie={selected}
          back={back}
          play={() => setScreen("player")}
        />
      ) : null}
    </View>
  );
}
function Login() {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [inviteCode, setInviteCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  async function submit() {
    if (
      !username.trim() ||
      password.length < 8 ||
      (register && (!displayName.trim() || !inviteCode.trim()))
    ) {
      setError(
        "Completa los campos; la contraseña debe tener al menos 8 caracteres.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (register)
        await api.register({
          username: username.trim(),
          password,
          displayName: displayName.trim(),
          inviteCode: inviteCode.trim(),
        });
      else await api.login(username.trim(), password);
    } catch (e) {
      setError(
        register && e instanceof ApiError && e.status === 404
          ? "El registro está desactivado. Solicita tu cuenta al administrador."
          : messageOf(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="">
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <Ionicons name="play" size={30} color="#fff" />
      </View>
      <Text style={styles.brand}>ALPINEFILM</Text>
      <Text style={styles.loginTitle}>
        {register
          ? "Tu invitación al cine."
          : "Buenas historias.\nTu propio espacio."}
      </Text>
      <Text style={styles.copy}>
        {register
          ? "Usa el código de invitación que te proporcionó el administrador."
          : "Entra a tu biblioteca privada."}
      </Text>
      {register && (
        <Field label="Nombre" value={displayName} onChange={setDisplayName} />
      )}
      <Field label="Usuario" value={username} onChange={setUsername} />
      <Field
        label="Contraseña"
        value={password}
        onChange={setPassword}
        secret
      />
      {register && (
        <Field
          label="Código de invitación"
          value={inviteCode}
          onChange={setInviteCode}
          secret
        />
      )}
      <ErrorText message={error} />
      <Button
        title={register ? "Crear cuenta" : "Entrar"}
        busy={busy}
        onPress={() => void submit()}
      />
      <Button
        title={register ? "Ya tengo cuenta" : "Crear cuenta con invitación"}
        secondary
        disabled={busy}
        onPress={() => {
          setRegister(!register);
          setError(undefined);
        }}
      />
    </Page>
  );
}
function Details({
  movie,
  back,
  play,
}: {
  movie: Movie;
  back: () => void;
  play: () => void;
}) {
  const [current, setCurrent] = useState(movie),
    [favorite, setFavorite] = useState(false),
    [position, setPosition] = useState(0),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api.movie(movie.id), api.favorites(), api.progress()])
      .then(([m, f, p]) => {
        if (active) {
          setCurrent(m);
          setFavorite(f.some((x) => x.id === m.id));
          const previous = p.find((x) => x.movieId === m.id);
          setPosition(
            resumePosition(
              previous?.positionSeconds ?? 0,
              m.durationSeconds ?? 0,
              previous?.completed,
            ),
          );
        }
      })
      .catch((e) => active && setError(messageOf(e)));
    return () => {
      active = false;
    };
  }, [movie.id]);
  async function toggle() {
    setBusy(true);
    try {
      await api.favorite(movie.id, !favorite);
      setFavorite(!favorite);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="La película" onBack={back}>
      <View
        style={{
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: colors.panel,
        }}
      >
        <Poster
          movie={current}
          style={{ aspectRatio: 0.82, borderRadius: 0 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", colors.panel]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 150,
          }}
        />
      </View>
      <View style={{ paddingHorizontal: 8, marginTop: 20 }}>
        <Text style={styles.eyebrow}>ALPINEFILM · TU BIBLIOTECA</Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 32,
            lineHeight: 38,
            fontWeight: "800",
            marginTop: 12,
          }}
        >
          {current.title}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
          }}
        >
          {[
            current.year?.toString(),
            current.durationSeconds
              ? `${Math.ceil(current.durationSeconds / 60)} min`
              : null,
            ...current.genres,
          ]
            .filter(Boolean)
            .map((label, i) => (
              <View
                key={`${label}-${i}`}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ color: colors.secondary, fontSize: 12 }}>
                  {label}
                </Text>
              </View>
            ))}
        </View>
        <ErrorText message={error} />
        <Button
          title={
            position > 0
              ? `Continuar · ${Math.floor(position / 60)} min`
              : "▶  Reproducir"
          }
          disabled={current.status !== "published"}
          onPress={play}
        />
        {current.status === "published" ? (
          <Button
            title={favorite ? "✓  En mi lista" : "+  Añadir a mi lista"}
            secondary
            busy={busy}
            onPress={() => void toggle()}
          />
        ) : (
          <Text style={styles.copy}>Esta película aún no está publicada.</Text>
        )}
        <Text style={styles.sectionTitle}>La historia</Text>
        <Text style={[styles.copy, { marginTop: 0, lineHeight: 27 }]}>
          {current.description ||
            "Todavía no hay una sinopsis para esta película."}
        </Text>
      </View>
    </Page>
  );
}
function Profile({ session, back }: { session: Session; back: () => void }) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title={session.user.displayName ?? session.user.username}
      onBack={back}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.panel,
          borderRadius: 28,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <View
          style={[styles.avatar, { width: 72, height: 72, borderRadius: 36 }]}
        >
          <Ionicons name="person-outline" color={colors.accent} size={32} />
        </View>
        <Text style={styles.copy}>
          {session.user.username} ·{" "}
          {session.user.role === "admin" ? "Administrador" : "Espectador"}
        </Text>
      </View>
      <ErrorText message={error} />
      <Text style={styles.sectionTitle}>Cambiar contraseña</Text>
      <Field
        label="Contraseña actual"
        value={current}
        onChange={setCurrent}
        secret
      />
      <Field label="Nueva contraseña" value={next} onChange={setNext} secret />
      <Button
        title="Cambiar y cerrar sesiones"
        busy={busy}
        onPress={() => void run(() => api.password(current, next))}
      />
      <Text style={styles.sectionTitle}>Tus sesiones</Text>
      <Button
        title="Cerrar sesión"
        busy={busy}
        onPress={() => void run(() => api.logout())}
      />
      <Button
        title="Cerrar todas mis sesiones"
        secondary
        disabled={busy}
        onPress={() => void run(() => api.logout(true))}
      />
      {error && (
        <Button
          title="Eliminar sesión de este dispositivo"
          secondary
          onPress={() =>
            Alert.alert(
              "Eliminar sesión local",
              "Esto no revoca el acceso en el servidor mientras esté desconectado.",
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Eliminar",
                  style: "destructive",
                  onPress: () => void api.forgetSession(),
                },
              ],
            )
          }
        />
      )}
    </Page>
  );
}
