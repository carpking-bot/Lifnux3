export type WorldGeneratorView = "home" | "map" | "entities" | "timeline" | "relations";

export type MapTool = "terrain" | "feature" | "marker" | "region";

export type BaseTerrain =
  | "ocean"
  | "shallow_water"
  | "coast"
  | "lake"
  | "river"
  | "plain"
  | "grassland"
  | "forest"
  | "jungle"
  | "desert"
  | "tundra"
  | "ice"
  | "swamp"
  | "wasteland"
  | "volcanic_land"
  | "custom";

export type Feature = "hill" | "mountain" | "high_mountain" | "volcano" | null;

export type Tile = {
  x: number;
  y: number;
  baseTerrain: BaseTerrain;
  feature: Feature;
  height: number;
  moisture: number;
  temperature: number;
  continentId?: string;
};

export type MapGenerationOptions = {
  seed: string;
  width: number;
  height: number;
  continentCount: number;
  waterLevel: number;
  mountainDensity: number;
  riverCount: number;
  forestDensity: number;
  desertDensity: number;
  snowLevel: number;
  climateMode: "earthlike" | "fantasy" | "chaotic";
};

export type TerrainWeights = {
  [K in BaseTerrain | NonNullable<Feature>]?: number;
};

export type MarkerType =
  | "City"
  | "Nation"
  | "Region"
  | "Dungeon"
  | "Forest"
  | "Mountain"
  | "Port"
  | "Custom";

export type RegionType = "Continent" | "Nation" | "Region" | "Danger Zone" | "Custom";

export type EntityType = "Character" | "Faction" | "Nation" | "Region" | "Event" | "Item" | "Location";

export type RelationType =
  | "belongs_to"
  | "enemy_of"
  | "allied_with"
  | "mentor_of"
  | "located_in"
  | "involved_in"
  | "caused_by"
  | "custom";

export interface WorldProject {
  id: string;
  name: string;
  description: string;
  selectedMapId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldMap {
  id: string;
  projectId: string;
  name: string;
  description: string;
  width: number;
  height: number;
  imageDataUrl?: string;
  drawingDataUrl?: string;
  drawingStrokes?: MapStroke[];
  generationOptions?: MapGenerationOptions;
  terrainWeights?: TerrainWeights;
  tiles?: Tile[];
  tileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  createdAt: string;
}

export interface MapLayer {
  id: string;
  projectId: string;
  mapId: string;
  name: string;
  visible: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapMarker {
  id: string;
  projectId: string;
  mapId: string;
  layerId: string;
  name: string;
  type: MarkerType;
  x: number;
  y: number;
  description: string;
  tags: string[];
  relatedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MapRegion {
  id: string;
  projectId: string;
  mapId: string;
  layerId: string;
  name: string;
  type: RegionType;
  points: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
  description: string;
  relatedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorldEntity {
  id: string;
  projectId: string;
  name: string;
  type: EntityType;
  description: string;
  tags: string[];
  imageUrl?: string;
  relatedEntityIds: string[];
  timelineDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldRelation {
  id: string;
  projectId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: RelationType;
  description: string;
  createdAt: string;
}

export interface WorldGeneratorState {
  projects: WorldProject[];
  maps: WorldMap[];
  layers: MapLayer[];
  markers: MapMarker[];
  regions: MapRegion[];
  entities: WorldEntity[];
  relations: WorldRelation[];
  selectedProjectId?: string;
}
