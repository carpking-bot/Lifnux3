"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { formatDateKey } from "../../(shared)/lib/date";
import type { Attendance, Segment, Song, Video } from "./types";
import { YouTubePlayer } from "./components/YouTubePlayer";
import { SongsPanel } from "./components/SongsPanel";
import { VideosPanel } from "./components/VideosPanel";
import { LoopControls } from "./components/LoopControls";
import { SegmentList } from "./components/SegmentList";
import { AttendancePanel } from "./components/AttendancePanel";

const SONG_KEY = "lifnux:guitar:songs";
const VIDEO_KEY = "lifnux:guitar:videos";
const SEGMENT_KEY = "lifnux:guitar:segments";
const ATTENDANCE_KEY = "lifnux:guitar:attendance";
const STATE_KEY = "lifnux:guitar:state";
const LEGACY_KEY = "lifnux:guitar:v1";
const LEGACY_SEGMENT_KEY = "lifnux.guitar.segments.v100";
const LEGACY_ATTENDANCE_KEY = "lifnux.guitar.attendance.v100";

type GuitarState = {
  selectedSongId?: string;
  selectedVideoId?: string;
  loopEnabled: boolean;
  aSec?: number;
  bSec?: number;
  speed: number;
  shadowing: boolean;
  attendanceCursor?: string;
};

export default function GuitarPage() {
  const playerRef = useRef<any>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | undefined>(undefined);
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>(undefined);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [aSec, setASec] = useState<number | undefined>(undefined);
  const [bSec, setBSec] = useState<number | undefined>(undefined);
  const [speed, setSpeed] = useState(1);
  const [shadowing, setShadowing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [attendanceCursor, setAttendanceCursor] = useState<Date>(() => new Date());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let loadedSongs = loadState<Song[]>(SONG_KEY, []);
    let loadedVideos = loadState<Video[]>(VIDEO_KEY, []);
    if (loadedSongs.length === 0 && loadedVideos.length === 0) {
      const legacy = loadState<{ songs?: Song[]; videos?: any[]; selectedSongId?: string } | null>(LEGACY_KEY, null);
      if (legacy?.songs) loadedSongs = legacy.songs;
      if (legacy?.videos) loadedVideos = legacy.videos as Video[];
      if (legacy?.selectedSongId) setSelectedSongId(legacy.selectedSongId);
    }
    const migratedSongs = loadedSongs.map((song) => ({
      ...song,
      difficulty:
        typeof song.difficulty === "number"
          ? (song.difficulty as Song["difficulty"])
          : song.difficulty
          ? (Number(song.difficulty) as Song["difficulty"])
          : undefined
    }));
    const migratedVideos = loadedVideos.map((video: any) => {
      if ("youtubeId" in video && "kind" in video) return video as Video;
      return {
        id: video.id,
        songId: video.songId,
        youtubeId: video.videoId ?? video.youtubeId ?? "",
        kind: video.type ?? video.kind ?? "OTHER",
        customTitle: video.title ?? video.customTitle,
        youtubeTitle: video.youtubeTitle,
        notes: video.notes,
        createdAt: video.createdAt ?? Date.now()
      } as Video;
    });
    setSongs(migratedSongs);
    setVideos(migratedVideos);
    const loadedSegments = loadState<Segment[]>(SEGMENT_KEY, []);
    const loadedAttendance = loadState<Attendance[]>(ATTENDANCE_KEY, []);
    setSegments(loadedSegments.length ? loadedSegments : loadState(LEGACY_SEGMENT_KEY, []));
    setAttendance(loadedAttendance.length ? loadedAttendance : loadState(LEGACY_ATTENDANCE_KEY, []));
    const loadedState = loadState<GuitarState | null>(STATE_KEY, null);
    if (loadedState) {
      setSelectedSongId(loadedState.selectedSongId);
      setSelectedVideoId(loadedState.selectedVideoId);
      if (typeof loadedState.loopEnabled === "boolean") setLoopEnabled(loadedState.loopEnabled);
      if (typeof loadedState.aSec === "number") setASec(loadedState.aSec);
      if (typeof loadedState.bSec === "number") setBSec(loadedState.bSec);
      if (typeof loadedState.speed === "number") setSpeed(loadedState.speed);
      if (typeof loadedState.shadowing === "boolean") setShadowing(loadedState.shadowing);
      if (loadedState.attendanceCursor) {
        const parsed = new Date(loadedState.attendanceCursor);
        if (!Number.isNaN(parsed.getTime())) setAttendanceCursor(parsed);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(SONG_KEY, songs);
  }, [songs, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveState(VIDEO_KEY, videos);
  }, [videos, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveState(SEGMENT_KEY, segments);
  }, [segments, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveState(ATTENDANCE_KEY, attendance);
  }, [attendance, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const payload: GuitarState = {
      selectedSongId,
      selectedVideoId,
      loopEnabled,
      aSec,
      bSec,
      speed,
      shadowing,
      attendanceCursor: attendanceCursor.toISOString()
    };
    saveState(STATE_KEY, payload);
  }, [selectedSongId, selectedVideoId, loopEnabled, aSec, bSec, speed, shadowing, attendanceCursor, hydrated]);

  useEffect(() => {
    if (selectedSongId && songs.find((song) => song.id === selectedSongId)) return;
    setSelectedSongId(songs[0]?.id);
  }, [songs, selectedSongId]);

  const songVideos = useMemo(() => videos.filter((video) => video.songId === selectedSongId), [videos, selectedSongId]);

  useEffect(() => {
    if (selectedVideoId && songVideos.find((video) => video.id === selectedVideoId)) return;
    setSelectedVideoId(songVideos[0]?.id);
  }, [songVideos, selectedVideoId]);

  const currentVideo = songVideos.find((video) => video.id === selectedVideoId);
  const currentSegments = useMemo(
    () => segments.filter((segment) => segment.videoId === selectedVideoId),
    [segments, selectedVideoId]
  );

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.setPlaybackRate(speed);
  }, [speed]);

  useEffect(() => {
    if (!loopEnabled || aSec === undefined || bSec === undefined) return;
    const interval = setInterval(() => {
      if (!playerRef.current) return;
      const current = playerRef.current.getCurrentTime?.();
      if (typeof current === "number" && current >= bSec) {
        playerRef.current.seekTo(aSec, true);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [loopEnabled, aSec, bSec]);

  useEffect(() => {
    if (!currentVideo) return;
    if (currentVideo.customTitle || currentVideo.youtubeTitle) return;
    fetchYouTubeTitle(currentVideo.youtubeId).then((title) => {
      if (!title) return;
      setVideos((prev) =>
        prev.map((entry) => (entry.id === currentVideo.id ? { ...entry, youtubeTitle: title } : entry))
      );
    });
  }, [currentVideo?.id]);

  const handleSelectVideo = (video: Video) => {
    setSelectedVideoId(video.id);
    setASec(undefined);
    setBSec(undefined);
  };

  const handleSegmentSelect = (segment: Segment) => {
    if (segment.videoId !== selectedVideoId) {
      setSelectedVideoId(segment.videoId);
    }
    setASec(segment.startSec);
    setBSec(segment.endSec);
    setSpeed(segment.speed);
    setLoopEnabled(true);
    if (playerRef.current) {
      playerRef.current.setPlaybackRate(segment.speed);
      playerRef.current.seekTo(segment.startSec, true);
    }
  };

  const clampRange = (start: number, end: number) => {
    const duration = playerRef.current?.getDuration?.();
    if (typeof duration === "number" && duration > 0) {
      const clampedEnd = Math.min(end, duration);
      const clampedStart = Math.min(start, clampedEnd);
      return [clampedStart, clampedEnd] as const;
    }
    return [start, end] as const;
  };

  const handleCheckIn = () => {
    const key = formatDateKey(new Date());
    if (attendance.some((entry) => entry.dateKey === key)) return;
    setAttendance([...attendance, { dateKey: key, createdAt: Date.now() }]);
  };

  const openConfirm = (title: string, message: string, action: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmAction(null);
    setConfirmTitle("");
    setConfirmMessage("");
  };

  const handleConfirm = () => {
    if (confirmAction) confirmAction();
    closeConfirm();
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1400px] pb-20 pt-10">
        <div className="mb-6">
          <div className="text-3xl">Guitar Practice</div>
          <div className="text-sm text-[var(--ink-1)]">Shadowing, loops, and attendance tracking.</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_0.8fr]">
          <div className="space-y-6">
            <div className="lifnux-glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Practice Player</div>
                <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  <input type="checkbox" checked={shadowing} onChange={() => setShadowing((prev) => !prev)} />
                  Shadowing Mode
                </label>
              </div>
              <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                <YouTubePlayer
                  videoId={currentVideo?.youtubeId}
                  onReady={(player) => {
                    playerRef.current = player;
                  }}
                />
                <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  {loopEnabled && aSec !== undefined && bSec !== undefined
                    ? `STATUS: SEGMENT LOOP (${formatMmss(aSec)} ~ ${formatMmss(bSec)}) @ ${speed.toFixed(2)}x`
                    : `STATUS: FREE PLAY @ ${speed.toFixed(2)}x`}
                </div>
                {shadowing ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black text-sm uppercase tracking-[0.3em] text-[var(--ink-1)]">
                    Shadowing Mode
                  </div>
                ) : null}
              </div>
            </div>

            <LoopControls
              aSec={aSec}
              bSec={bSec}
              speed={speed}
              loopEnabled={loopEnabled}
              onSetA={() => {
                if (!playerRef.current) return;
                const current = playerRef.current.getCurrentTime?.();
                if (typeof current === "number") setASec(current);
              }}
              onSetB={() => {
                if (!playerRef.current) return;
                const current = playerRef.current.getCurrentTime?.();
                if (typeof current === "number") setBSec(current);
              }}
              onLoopToggle={() => setLoopEnabled((prev) => !prev)}
              onSpeedChange={(next) => setSpeed(next)}
              onApplyRange={(startSec, endSec) => {
                const [start, end] = clampRange(startSec, endSec);
                setASec(start);
                setBSec(end);
                if (loopEnabled && playerRef.current) {
                  playerRef.current.seekTo(start, true);
                }
              }}
              onSaveSegment={({ name, startSec, endSec, speed: nextSpeed }) => {
                if (!currentVideo) return;
                const [start, end] = clampRange(startSec, endSec);
                setASec(start);
                setBSec(end);
                setSegments([
                  ...segments,
                  {
                    id: crypto.randomUUID(),
                    videoId: currentVideo.id,
                    name,
                    startSec: start,
                    endSec: end,
                    speed: nextSpeed,
                    createdAt: Date.now()
                  }
                ]);
              }}
            />

            <SegmentList
              segments={currentSegments}
              onSelect={handleSegmentSelect}
              onDelete={(segment) => {
                openConfirm("Delete Segment", "이 구간을 삭제할까요?", () => {
                  setSegments(segments.filter((entry) => entry.id !== segment.id));
                });
              }}
            />
          </div>

          <aside className="space-y-6">
            <SongsPanel
              songs={songs}
              selectedSongId={selectedSongId}
              onSelect={setSelectedSongId}
              onSave={(song) => setSongs([...songs, song])}
              onUpdate={(updated) =>
                setSongs(songs.map((song) => (song.id === updated.id ? updated : song)))
              }
              onDelete={(song) => {
                openConfirm("Delete Song", "이 곡을 삭제할까요? 연결된 영상들도 함께 삭제됩니다.", () => {
                  setSongs(songs.filter((entry) => entry.id !== song.id));
                  const nextVideos = videos.filter((entry) => entry.songId !== song.id);
                  setVideos(nextVideos);
                  const nextVideoIds = new Set(nextVideos.map((entry) => entry.id));
                  setSegments(segments.filter((segment) => nextVideoIds.has(segment.videoId)));
                  if (selectedSongId === song.id) {
                    setSelectedSongId(undefined);
                    setSelectedVideoId(undefined);
                  }
                });
              }}
            />
            <VideosPanel
              song={songs.find((song) => song.id === selectedSongId)}
              videos={songVideos}
              selectedVideoId={selectedVideoId}
              onSelect={handleSelectVideo}
              onSave={(video) => setVideos([...videos, video])}
              onUpdate={(updated) =>
                setVideos(videos.map((video) => (video.id === updated.id ? updated : video)))
              }
              onDelete={(video) => {
                openConfirm("Delete Video", "이 영상을 삭제할까요?", () => {
                  setVideos(videos.filter((entry) => entry.id !== video.id));
                  setSegments(segments.filter((segment) => segment.videoId !== video.id));
                  if (selectedVideoId === video.id) {
                    setSelectedVideoId(undefined);
                  }
                });
              }}
            />
            <AttendancePanel
              attendance={attendance}
              onCheckIn={handleCheckIn}
              onUndo={() => {
                const key = formatDateKey(new Date());
                openConfirm("Cancel Attendance", "오늘 출석을 취소할까요?", () => {
                  setAttendance(attendance.filter((entry) => entry.dateKey !== key));
                });
              }}
              cursor={attendanceCursor}
              onPrevMonth={() =>
                setAttendanceCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
              }
              onNextMonth={() =>
                setAttendanceCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
              }
            />
          </aside>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        description={confirmMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
      />
    </AppShell>
  );
}

function formatMmss(value: number) {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function fetchYouTubeTitle(videoId: string) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!response.ok) return "";
    const data = (await response.json()) as { title?: string };
    return data.title ?? "";
  } catch {
    return "";
  }
}



