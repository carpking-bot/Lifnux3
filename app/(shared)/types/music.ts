export type QueueItem = {
  id: string;
  videoId: string;
  title: string;
  url: string;
};

export type PresetTrack = {
  id: string;
  videoId: string;
  title: string;
  url: string;
};

export type Preset = {
  id: string;
  name: string;
  urls: string[];
  tracks?: PresetTrack[];
};

export type RepeatMode = "OFF" | "ALL" | "ONE";
