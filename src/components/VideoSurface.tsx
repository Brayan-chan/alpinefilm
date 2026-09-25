import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { VideoView, type VideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Orientation from "expo-screen-orientation";
import { NavigationBar } from "expo-navigation-bar";
import Slider from "@react-native-community/slider";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme/colors";
import { CastPicker } from "./CastPicker";
import { formatPlaybackTime, clampSeek } from "../playback/controls";

// Serialize enter/exit operations: leaving during an asynchronous orientation
// change must restore the screen after that change finishes, not before it.
let environmentQueue: Promise<void> = Promise.resolve();
export function VideoSurface({
  player,
  title,
  movieId,
  busy,
  error,
  back,
  retry,
  restart,
}: {
  player: VideoPlayer;
  title: string;
  movieId: string;
  busy: boolean;
  error?: string;
  back: () => void;
  retry: () => void;
  restart: () => void;
}) {
  const [fit, setFit] = useState<"contain" | "cover">("contain"),
    [casting, setCasting] = useState(false),
    [remote, setRemote] = useState(false),
    [visible, setVisible] = useState(true),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [scrubbing, setScrubbing] = useState(false),
    [interaction, setInteraction] = useState(0),
    [screenReader, setScreenReader] = useState(false),
    [screenError, setScreenError] = useState<string>();
  const insets = useSafeAreaInsets(),
    start = useRef(0),
    alive = useRef(true),
    isScrubbing = useRef(false);
  const touch = () => {
    setVisible(true);
    setInteraction((n) => n + 1);
  };
  useEffect(() => {
    alive.current = true;
    let active = true;
    let oldOrientation: Orientation.OrientationLock | undefined;

    environmentQueue = environmentQueue
      .then(async () => {
        oldOrientation = await Orientation.getOrientationLockAsync();
        await Orientation.lockAsync(Orientation.OrientationLock.LANDSCAPE);
      })
      .catch(() => {
        if (active)
          setScreenError(
            "No se pudo activar el modo horizontal automáticamente.",
          );
      });
    return () => {
      active = false;
      alive.current = false;
      environmentQueue = environmentQueue
        .then(async () => {
          if (oldOrientation !== undefined)
            await Orientation.lockAsync(oldOrientation);
        })
        .catch(() => {});
    };
  }, []);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setScreenReader(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const time = player.addListener("timeUpdate", (e) => {
      if (active && !isScrubbing.current) setPosition(e.currentTime);
    });
    const source = player.addListener("sourceLoad", (e) => {
      if (active) setDuration(e.duration);
    });
    const play = player.addListener("playingChange", (e) => {
      if (active) {
        setPlaying(e.isPlaying);
        if (!e.isPlaying) setVisible(true);
      }
    });
    return () => {
      active = false;
      time.remove();
      source.remove();
      play.remove();
    };
  }, [player]);
  useEffect(() => {
    if (error || busy) setVisible(true);
  }, [error, busy]);
  useEffect(() => {
    if (!visible || !playing || busy || error || scrubbing || screenReader)
      return;
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [visible, playing, busy, error, scrubbing, interaction, screenReader]);
  const action = (fn: () => void) => {
    if (!alive.current) return;
    touch();
    try {
      fn();
    } catch {
      setScreenError(
        "No se pudo ejecutar el control. Intenta abrir la película de nuevo.",
      );
    }
  };
  const seek = (target: number) =>
    action(() => {
      const value = clampSeek(target, duration);
      player.currentTime = value;
      setPosition(value);
    });
  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (e) =>
          e.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponderCapture: (e) =>
          e.nativeEvent.touches.length === 2,
        onPanResponderGrant: (e) => {
          const [a, b] = e.nativeEvent.touches;
          start.current =
            a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
        },
        onPanResponderMove: (e) => {
          const [a, b] = e.nativeEvent.touches;
          if (!a || !b || !start.current) return;
          const ratio =
            Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) / start.current;
          if (ratio > 1.15) {
            setFit("cover");
            setVisible(false);
          } else if (ratio < 0.85) {
            setFit("contain");
            setVisible(false);
          }
        },
        onPanResponderRelease: () => {
          start.current = 0;
        },
        onPanResponderTerminate: () => {
          start.current = 0;
        },
      }),
    [],
  );
  return (
    <View style={s.screen} {...gesture.panHandlers}>
      <StatusBar hidden />
      <NavigationBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        surfaceType="textureView"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? "Ocultar controles" : "Mostrar controles"}
        onPress={() => {
          setVisible((v) => !v);
          setInteraction((n) => n + 1);
        }}
        style={StyleSheet.absoluteFill}
      />
      {visible ? (
        <View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFill,
            s.overlay,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 14),
              paddingLeft: Math.max(insets.left, 20),
              paddingRight: Math.max(insets.right, 20),
            },
          ]}
        >
          <View style={s.top} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a la película"
              onPress={back}
              style={s.icon}
            >
              <Ionicons name="arrow-back" size={27} color="#fff" />
            </Pressable>
            <Text numberOfLines={1} style={s.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buscar TV en Wi-Fi"
              style={s.icon}
              onPress={() =>
                action(() => {
                  player.pause();
                  setCasting(true);
                })
              }
            >
              <Ionicons name="tv-outline" size={25} color="#fff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver desde el inicio"
              disabled={busy || remote}
              onPress={() => action(restart)}
              style={[s.restart, busy && { opacity: 0.4 }]}
            >
              <Ionicons name="play-back" size={20} color="#fff" />
              <Text style={s.label}>Desde el inicio</Text>
            </Pressable>
          </View>
          <View style={s.middle} pointerEvents="box-none">
            {remote ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCasting(true)}
                style={s.retry}
              >
                <Text style={s.label}>Enviando a la TV · Ver controles</Text>
              </Pressable>
            ) : busy ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : error ? (
              <View style={s.message}>
                <Text accessibilityRole="alert" style={s.messageText}>
                  {error}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => action(retry)}
                  style={s.retry}
                >
                  <Text style={s.label}>Reintentar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.transport}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retroceder 10 segundos"
                  onPress={() => seek(position - 10)}
                  style={s.seek}
                >
                  <Ionicons name="play-back-outline" size={28} color="#fff" />
                  <Text style={s.label}>10 s</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing ? "Pausar" : "Reproducir"}
                  onPress={() =>
                    action(() => (playing ? player.pause() : player.play()))
                  }
                  style={s.play}
                >
                  <Ionicons
                    name={playing ? "pause" : "play"}
                    size={42}
                    color="#fff"
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Avanzar 10 segundos"
                  onPress={() => seek(position + 10)}
                  style={s.seek}
                >
                  <Ionicons
                    name="play-forward-outline"
                    size={28}
                    color="#fff"
                  />
                  <Text style={s.label}>10 s</Text>
                </Pressable>
              </View>
            )}
          </View>
          <View>
            {screenError ? (
              <Text style={s.messageText}>{screenError}</Text>
            ) : null}
            <View style={s.timeline}>
              <Text style={s.time}>{formatPlaybackTime(position)}</Text>
              <Slider
                accessibilityLabel="Posición de reproducción"
                style={{ flex: 1, height: 44 }}
                minimumValue={0}
                maximumValue={Math.max(duration, 1)}
                value={clampSeek(position, duration)}
                disabled={remote || busy || duration <= 0}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor="#ffffff60"
                thumbTintColor="#fff"
                onSlidingStart={() => {
                  isScrubbing.current = true;
                  setScrubbing(true);
                  touch();
                }}
                onValueChange={setPosition}
                onSlidingComplete={(value) => {
                  isScrubbing.current = false;
                  setScrubbing(false);
                  seek(value);
                }}
              />
              <Text style={s.time}>{formatPlaybackTime(duration)}</Text>
            </View>
          </View>
        </View>
      ) : null}
      {
        <CastPicker
          visible={casting}
          movieId={movieId}
          title={title}
          onCastingChange={setRemote}
          close={() => {
            setCasting(false);
            touch();
          }}
        />
      }
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  overlay: { backgroundColor: "#00000066", justifyContent: "space-between" },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "600" },
  restart: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  label: { color: "#fff", fontSize: 14, fontWeight: "600" },
  middle: { flex: 1, justifyContent: "center", alignItems: "center" },
  transport: { flexDirection: "row", alignItems: "center", gap: 48 },
  seek: {
    minWidth: 64,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  play: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ffffff18",
    alignItems: "center",
    justifyContent: "center",
  },
  timeline: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: {
    color: "#fff",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 52,
    textAlign: "center",
  },
  message: { maxWidth: 520, alignItems: "center", gap: 12 },
  messageText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retry: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "#ffffff25",
  },
});
