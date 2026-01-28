export type Song = {
  id: string;
  title: string;
  artist: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  bpm?: number;
  createdAt: number;
};

export type VideoType = "BACKING" | "TAB" | "PRACTICE" | "OTHER";

export type Video = {
  id: string;
  songId: string;
  youtubeId: string;
  kind: VideoType;
  customTitle?: string;
  youtubeTitle?: string;
  notes?: string;
  createdAt: number;
};

export type Segment = {
  id: string;
  videoId: string;
  name: string;
  startSec: number;
  endSec: number;
  speed: number;
  createdAt: number;
};

export type Attendance = {
  dateKey: string;
  createdAt: number;
};
