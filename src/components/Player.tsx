import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { VideoSurface } from "./VideoSurface";
import { useVideoPlayer } from "expo-video";
import { api, mediaUrl, messageOf } from "../api/client";
import type { Movie } from "../types/api";
import { resumePosition } from "../playback/progress";

export function Player({ movie, back }: { movie: Movie; back: () => void }) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 1;
  });
  const [error, setError] = useState<string>(),
    [busy, setBusy] = useState(true),
    [attempt, setAttempt] = useState(0);
  const restart = useRef(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true,
      position = 0,
      duration = movie.durationSeconds ?? 0,
      completed = false;
    let initialized = false,
      confirmed = false,
      pendingPosition: number | undefined,
      sourceLoaded = false,
      autoplay = true;
    let lastSaved = Date.now(),
      renewal: ReturnType<typeof setTimeout> | undefined;
    // Serialize saves across retries/restarts as well as within one playback.
    const save = () => {
      if (!confirmed || duration <= 0) return Promise.resolve();
      const snapshot = { position, duration, completed };
      saveChain.current = saveChain.current
        .then(async () => {
          await api.saveProgress(
            movie.id,
            snapshot.position,
            snapshot.duration,
            snapshot.completed,
          );
        })
        .catch((e) => {
          if (active)
            setError(`No se pudo guardar el progreso: ${messageOf(e)}`);
        });
      return saveChain.current;
    };
    let normalizeResume = true;
    const applyPosition = () => {
      if (!active || !sourceLoaded || pendingPosition === undefined) return;
      position = normalizeResume
        ? resumePosition(pendingPosition, duration, completed)
        : Math.min(pendingPosition, duration);
      pendingPosition = undefined;
      player.currentTime = position;
      initialized = true;
      lastSaved = Date.now();
      if (autoplay && AppState.currentState !== "background") player.play();
    };
    const sourceEvent = player.addListener("sourceLoad", (e) => {
      if (!active) return;
      if (Number.isFinite(e.duration) && e.duration > 0) duration = e.duration;
      sourceLoaded = true;
      applyPosition();
    });
    const time = player.addListener("timeUpdate", (e) => {
      if (
        !active ||
        !initialized ||
        !Number.isFinite(e.currentTime) ||
        e.currentTime < 0
      )
        return;
      // Ignore a stale native timestamp while the initial seek is still settling.
      if (!confirmed && Math.abs(e.currentTime - position) > 5) return;
      confirmed = true;
      position = Math.min(e.currentTime, duration);
      if (position < duration - 1) completed = false;
      if (Date.now() - lastSaved >= 15000) {
        lastSaved = Date.now();
        void save();
      }
    });
    const end = player.addListener("playToEnd", () => {
      if (!active || !confirmed) return;
      completed = true;
      position = duration;
      void save();
    });
    const status = player.addListener("statusChange", (e) => {
      if (!active) return;
      setBusy(e.status === "loading");
      if (e.status === "error")
        setError(
          "No se pudo reproducir. Comprueba la conexión y reintenta. Si persiste, este dispositivo podría no admitir el formato de video o audio del archivo.",
        );
    });
    const load = async (initial: boolean) => {
      if (!active) return;
      setBusy(true);
      setError(undefined);
      normalizeResume = initial;

      initialized = false;
      confirmed = false;
      sourceLoaded = false;
      pendingPosition = undefined;
      try {
        autoplay = initial || player.playing;
        player.pause();
        // Request progress and playback authorization together rather than adding
        // two network round trips before asking the native player to load.
        const [source, progress] = await Promise.all([
          api.playback(movie.id),
          initial && !restart.current
            ? api.progress().catch(() => {
                if (active)
                  setError(
                    "No se pudo recuperar el progreso. La película comenzará desde el inicio.",
                  );
                return [];
              })
            : Promise.resolve([]),
        ]);
        if (!active) return;
        if (initial) {
          const previous = progress.find((p) => p.movieId === movie.id);
          completed = previous?.completed ?? false;
          position = restart.current
            ? 0
            : resumePosition(
                previous?.positionSeconds ?? 0,
                duration,
                completed,
              );
          completed = false;
          restart.current = false;
        }
        pendingPosition = position;
        await player.replaceAsync({
          uri: mediaUrl(source.streamUrl),
          contentType: "progressive",
          metadata: { title: movie.title },
        });
        if (!active) return;
        applyPosition();
        renewal = setTimeout(
          () => void load(false),
          Math.max(
            1000,
            new Date(source.expiresAt).getTime() - Date.now() - 60000,
          ),
        );
      } catch (e) {
        if (active) {
          setBusy(false);
          setError(messageOf(e));
        }
      }
    };
    const appState = AppState.addEventListener("change", (s) => {
      if (active && s !== "active") {
        player.pause();
        void save();
      }
    });
    void load(true);
    return () => {
      active = false;
      clearTimeout(renewal);
      // useVideoPlayer owns disposal. It may release before this cleanup.
      // Save only JS snapshots; never call a native method here.
      void save();
      sourceEvent.remove();
      time.remove();
      end.remove();
      status.remove();
      appState.remove();
    };
  }, [movie.id, player, attempt]);
  return (
    <VideoSurface
      player={player}
      title={movie.title}
      movieId={movie.id}
      busy={busy}
      error={error}
      back={back}
      restart={() => {
        restart.current = true;
        setAttempt((n) => n + 1);
      }}
      retry={() => setAttempt((n) => n + 1)}
    />
  );
}
