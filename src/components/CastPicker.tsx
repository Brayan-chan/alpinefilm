import { useEffect, useRef, useState } from "react";
import { canControlTV, tvErrorMessage } from "../casting/transport";
import { api, mediaUrl } from "../api/client";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  controlTV,
  discoverTVs,
  dlnaAvailable,
  sendToTV,
  renewCast,
  castStatus,
  endCast,
  type DlnaAction,
  type DlnaDevice,
} from "../casting/dlna";

export function CastPicker({
  close,
  visible,
  movieId,
  title,
  onCastingChange,
}: {
  close: () => void;
  visible: boolean;
  movieId: string;
  title: string;
  onCastingChange: (value: boolean) => void;
}) {
  const [devices, setDevices] = useState<DlnaDevice[]>([]);
  const [selected, setSelected] = useState<DlnaDevice>();
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState("");
  const [session, setSession] = useState(false);
  const [delivery, setDelivery] = useState("");
  const expires = useRef(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void endCast().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!session || !selected) return;
    let active = true;
    const started = Date.now();
    const timer = setInterval(() => {
      if (pending.current) return;
      pending.current = true;
      void (async () => {
        if (Date.now() > expires.current - 60000) {
          const source = await api.playback(movieId);
          if (!active) return;
          await renewCast(
            mediaUrl(source.streamUrl),
            Date.parse(source.expiresAt),
          );
          expires.current = Date.parse(source.expiresAt);
        }
        const status = await castStatus();
        if (!active) return;
        if (!status?.active) {
          setSession(false);
          onCastingChange(false);
          setError("El envío terminó. Puedes volver a enviar la película.");
          return;
        }
        if (status?.error) setError(status.error);
        setDelivery(
          status && status.bytesSent > 0
            ? "La TV está recibiendo el video."
            : Date.now() - started > 15000
              ? "La TV todavía no ha solicitado el video. Comprueba que la red permita conexiones entre la TV y el teléfono."
              : "Esperando que la TV solicite el video…",
        );
        const transport = await controlTV(selected.id, "GetTransportInfo");
        if (active) setState(transport.CurrentTransportState ?? "");
      })()
        .catch((e) => {
          if (active) setError(tvErrorMessage(e));
        })
        .finally(() => {
          pending.current = false;
        });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, selected, movieId, onCastingChange]);
  const run = async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      if (mounted.current) setError(tvErrorMessage(e));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const search = () =>
    void run(async () => {
      setSelected(undefined);
      setState("");
      setDevices([]);
      const found = await discoverTVs();
      if (mounted.current) {
        setDevices(found);
        setSearched(true);
      }
    });
  const send = () =>
    void run(async () => {
      if (!selected) return;
      setDelivery("Preparando el envío…");
      const source = await api.playback(movieId);
      if (!mounted.current) return;
      expires.current = Date.parse(source.expiresAt);
      await sendToTV(
        selected.id,
        mediaUrl(source.streamUrl),
        title,
        expires.current,
      );
      if (!mounted.current) return;
      setSession(true);
      onCastingChange(true);
      setDelivery("Envío solicitado. Esperando que la TV reciba el video…");
      setState("");
    });
  const disconnect = () =>
    void run(async () => {
      await endCast();
      if (!mounted.current) return;
      setSession(false);
      onCastingChange(false);
      setDelivery("");
      setState("");
    });
  const command = (action: DlnaAction) =>
    void run(async () => {
      if (!selected || !canControlTV(state, action)) return;
      if (action !== "GetTransportInfo") {
        const current = await controlTV(selected.id, "GetTransportInfo");
        if (mounted.current) setState(current.CurrentTransportState ?? "");
        if (!canControlTV(current.CurrentTransportState ?? "", action)) return;
        // An unsuccessful command leaves the actual state unconfirmed.
        if (mounted.current) setState("");
        await controlTV(selected.id, action);
      }
      const result = await controlTV(selected.id, "GetTransportInfo");
      if (mounted.current) setState(result.CurrentTransportState ?? "");
    });
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) close();
      }}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>TV en tu Wi-Fi</Text>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              disabled={busy}
              style={s.button}
            >
              <Text style={s.text}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.text}>
              Conecta el teléfono y la TV al mismo Wi-Fi y activa «Compartir
              contenido» en la TV.
            </Text>
            {!dlnaAvailable ? (
              <Text style={s.text}>
                Necesitas la compilación Android con DLNA. Expo Go no incluye
                este módulo.
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={session || busy || !dlnaAvailable}
              onPress={search}
              style={[
                s.button,
                (session || busy || !dlnaAvailable) && s.disabled,
              ]}
            >
              <Text style={s.text}>
                {searched ? "Buscar de nuevo" : "Buscar televisores"}
              </Text>
            </Pressable>
            {busy ? (
              <ActivityIndicator
                color="#DA263B"
                accessibilityLabel="Contactando con la TV"
              />
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            {searched && !busy && devices.length === 0 ? (
              <Text style={s.text}>
                No encontramos TVs DLNA. Comprueba que estén encendidas y que el
                router permita comunicar los dispositivos.
              </Text>
            ) : null}
            {devices.map((device) => (
              <Pressable
                key={device.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selected?.id === device.id }}
                disabled={busy || session}
                style={[s.device, selected?.id === device.id && s.selected]}
                onPress={() =>
                  void run(async () => {
                    setSelected(device);
                    setState("");
                    const result = await controlTV(
                      device.id,
                      "GetTransportInfo",
                    );
                    if (mounted.current)
                      setState(result.CurrentTransportState ?? "");
                  })
                }
              >
                <Text style={s.title}>{device.name}</Text>
                <Text style={s.text}>{device.ip} · DLNA</Text>
              </Pressable>
            ))}
            {selected ? (
              <>
                <Text style={s.text}>
                  Estado de la TV: {state ? label(state) : "Sin confirmar"}
                </Text>
                <Text style={s.text}>
                  {session
                    ? delivery
                    : `Enviar «${title}» a ${selected.name}. La película comenzará desde el inicio.`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={session ? disconnect : send}
                  style={[
                    s.button,
                    { backgroundColor: "#DA263B" },
                    busy && s.disabled,
                  ]}
                >
                  <Text style={s.text}>
                    {session
                      ? "Terminar envío"
                      : "Enviar película desde el inicio"}
                  </Text>
                </Pressable>
                <View style={s.controls}>
                  {(["GetTransportInfo", "Play", "Pause", "Stop"] as const).map(
                    (action, index) => (
                      <Pressable
                        key={action}
                        accessibilityRole="button"
                        disabled={busy || !canControlTV(state, action)}
                        onPress={() => command(action)}
                        style={[
                          s.button,
                          (busy || !canControlTV(state, action)) && s.disabled,
                        ]}
                      >
                        <Text style={s.text}>
                          {
                            ["Consultar", "Reproducir", "Pausar", "Detener"][
                              index
                            ]
                          }
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              </>
            ) : null}
            <Text style={s.note}>
              Mantén esta pantalla de reproducción abierta y el teléfono
              conectado al Wi-Fi y a Tailscale. Puedes cerrar este panel; salir
              de la película termina el envío.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function label(value?: string) {
  return (
    (
      {
        PLAYING: "Reproduciendo",
        PAUSED_PLAYBACK: "En pausa",
        STOPPED: "Detenida",
        NO_MEDIA_PRESENT: "Sin video",
        TRANSITIONING: "Cargando",
      } as Record<string, string>
    )[value ?? ""] ?? "Estado no reconocido"
  );
}
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000b",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "95%",
    backgroundColor: "#17171C",
    borderRadius: 24,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  content: { gap: 14, paddingVertical: 12 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  text: { color: "#eee", fontSize: 14, lineHeight: 21 },
  note: { color: "#b9b9c3", fontSize: 13, lineHeight: 19 },
  error: { color: "#ff929d", lineHeight: 21 },
  button: {
    backgroundColor: "#303038",
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  device: {
    padding: 16,
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#50505a",
  },
  selected: { borderColor: "#DA263B" },
  disabled: { opacity: 0.4 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
