export type QueueItem = {
  id: string;
  videoId: string;
  title: string;
  url: string;
  customTitle?: string;
};

export type PresetTrack = {
  id: string;
  videoId: string;
  title: string;
  url: string;
  customTitle?: string;
};

export type Preset = {
  id: string;
  name: string;
  urls: string[];
  tracks?: PresetTrack[];
  isRatingPreset?: boolean;
};

export type RepeatMode = "off" | "all" | "one";
