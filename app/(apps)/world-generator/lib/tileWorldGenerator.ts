import type { BaseTerrain, Feature, MapGenerationOptions, TerrainWeights, Tile } from "../types";

export const BASE_TERRAINS: BaseTerrain[] = [
  "ocean",
  "shallow_water",
  "coast",
  "lake",
  "river",
  "plain",
  "grassland",
  "forest",
  "jungle",
  "desert",
  "tundra",
  "ice",
  "swamp",
  "wasteland",
  "volcanic_land",
  "custom"
];

export const FEATURES: NonNullable<Feature>[] = ["hill", "mountain", "high_mountain", "volcano"];

export const DEFAULT_GENERATION_OPTIONS: MapGenerationOptions = {
  seed: "asteria-342",
  width: 120,
  height: 80,
  continentCount: 4,
  waterLevel: 0.5,
  mountainDensity: 0.45,
  riverCount: 12,
  forestDensity: 0.55,
  desertDensity: 0.35,
  snowLevel: 0.35,
  climateMode: "earthlike"
};

export const DEFAULT_TERRAIN_WEIGHTS: TerrainWeights = Object.fromEntries(
  [...BASE_TERRAINS, ...FEATURES].map((key) => [key, 1])
) as TerrainWeights;

export const TERRAIN_COLORS: Record<BaseTerrain, string> = {
  ocean: "#17304d",
  shallow_water: "#2f6f88",
  coast: "#b8a36a",
  lake: "#2b7398",
  river: "#55a8c6",
  plain: "#9aa46c",
  grassland: "#6f9f58",
  forest: "#2f6b45",
  jungle: "#1d704b",
  desert: "#c7a861",
  tundra: "#9aa6a1",
  ice: "#d7edf0",
  swamp: "#526b48",
  wasteland: "#776f62",
  volcanic_land: "#5a3c36",
  custom: "#8b6fd1"
};

export const FEATURE_COLORS: Record<NonNullable<Feature>, string> = {
  hill: "#6d7654",
  mountain: "#4f5351",
  high_mountain: "#d7ded9",
  volcano: "#d15a3c"
};

type Candidate = { terrain: BaseTerrain; score: number };

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string) {
  let value = hashString(seed) || 1;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function indexOf(x: number, y: number, width: number) {
  return y * width + x;
}

function neighbors(x: number, y: number, width: number, height: number) {
  const result: Array<{ x: number; y: number }> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push({ x: nx, y: ny });
    }
  }
  return result;
}

function valueNoise(x: number, y: number, seed: string) {
  const h = hashString(`${seed}:${Math.floor(x)}:${Math.floor(y)}`);
  return (h % 10000) / 10000;
}

function smoothNoise(x: number, y: number, scale: number, seed: string) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const fade = (t: number) => t * t * (3 - 2 * t);
  const a = valueNoise(x0, y0, seed);
  const b = valueNoise(x0 + 1, y0, seed);
  const c = valueNoise(x0, y0 + 1, seed);
  const d = valueNoise(x0 + 1, y0 + 1, seed);
  const u = fade(tx);
  const v = fade(ty);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fractalNoise(x: number, y: number, seed: string) {
  return clamp(
    smoothNoise(x, y, 42, seed) * 0.52 +
      smoothNoise(x, y, 18, `${seed}:detail`) * 0.3 +
      smoothNoise(x, y, 7, `${seed}:fine`) * 0.18
  );
}

function chooseWeighted(candidates: Candidate[], random: () => number) {
  const total = candidates.reduce((sum, item) => sum + Math.max(0, item.score), 0);
  if (total <= 0) return candidates[0]?.terrain ?? "plain";
  let roll = random() * total;
  for (const item of candidates) {
    roll -= Math.max(0, item.score);
    if (roll <= 0) return item.terrain;
  }
  return candidates[candidates.length - 1]?.terrain ?? "plain";
}

function addCandidate(candidates: Candidate[], terrain: BaseTerrain, suitability: number, weights: TerrainWeights) {
  const weight = weights[terrain] ?? 1;
  if (weight <= 0 || suitability <= 0) return;
  candidates.push({ terrain, score: suitability * weight });
}

function getTile(tiles: Tile[], x: number, y: number, width: number) {
  return tiles[indexOf(x, y, width)];
}

function isWater(tile: Tile) {
  return tile.baseTerrain === "ocean" || tile.baseTerrain === "shallow_water" || tile.baseTerrain === "lake" || tile.baseTerrain === "river";
}

function isLand(tile: Tile) {
  return !isWater(tile);
}

function buildContinents(options: MapGenerationOptions, random: () => number) {
  const { width, height, continentCount } = options;
  const seeds = Array.from({ length: continentCount }, (_, i) => ({
    id: `continent_${i + 1}`,
    x: Math.floor(width * (0.18 + random() * 0.64)),
    y: Math.floor(height * (0.15 + random() * 0.7)),
    rx: width * (0.12 + random() * 0.18),
    ry: height * (0.12 + random() * 0.18)
  }));
  return seeds;
}

function initialTerrain(tile: Tile, weights: TerrainWeights, random: () => number): BaseTerrain {
  if (tile.height <= 0.07) return "ocean";
  if (tile.height <= 0.12) return "shallow_water";
  if (tile.height <= 0.17) return "coast";

  const t = tile.temperature;
  const m = tile.moisture;
  const h = tile.height;
  const candidates: Candidate[] = [];

  addCandidate(candidates, "plain", 0.5 + (1 - Math.abs(m - 0.45)) * 0.4, weights);
  addCandidate(candidates, "grassland", (1 - Math.abs(m - 0.55)) * (1 - Math.abs(t - 0.55)), weights);
  addCandidate(candidates, "forest", clamp((m - 0.45) * 2.2) * clamp(1 - Math.abs(t - 0.5)), weights);
  addCandidate(candidates, "jungle", clamp((m - 0.62) * 2.4) * clamp((t - 0.62) * 2.2), weights);
  addCandidate(candidates, "desert", clamp((t - 0.58) * 1.8) * clamp((0.38 - m) * 2.5), weights);
  addCandidate(candidates, "tundra", clamp((0.38 - t) * 2) * clamp(1 - m * 0.4), weights);
  addCandidate(candidates, "ice", clamp((0.22 - t) * 4) * clamp(h + 0.1), weights);
  addCandidate(candidates, "swamp", clamp((m - 0.7) * 2.2) * clamp(0.45 - h), weights);
  addCandidate(candidates, "wasteland", clamp((h - 0.68) * 1.5) * clamp(0.45 - m), weights);
  addCandidate(candidates, "volcanic_land", clamp((h - 0.74) * 2.8) * clamp((t - 0.52) * 1.4), weights);

  return chooseWeighted(candidates.length ? candidates : [{ terrain: "plain", score: 1 }], random);
}

function applyFeature(tile: Tile, options: MapGenerationOptions, weights: TerrainWeights, random: () => number): Feature {
  const mountainWeight = weights.mountain ?? 1;
  const highWeight = weights.high_mountain ?? 1;
  const hillWeight = weights.hill ?? 1;
  const volcanoWeight = weights.volcano ?? 1;
  if (tile.baseTerrain === "ocean" || tile.baseTerrain === "shallow_water" || tile.baseTerrain === "lake" || tile.baseTerrain === "river") return null;
  if (tile.baseTerrain === "volcanic_land" && volcanoWeight > 0 && random() < 0.08 * volcanoWeight) return "volcano";
  const mountainScore = clamp((tile.height - 0.68) * 3.2) * options.mountainDensity * mountainWeight;
  if (mountainScore > 0.45 && random() < mountainScore * 0.55) {
    if (tile.height > 0.82 && highWeight > 0 && random() < 0.45 * highWeight) return "high_mountain";
    return "mountain";
  }
  const hillScore = clamp((tile.height - 0.52) * 2.2) * hillWeight;
  if (hillScore > 0.2 && random() < hillScore * 0.35) return "hill";
  return null;
}

function applyCoasts(tiles: Tile[], width: number, height: number): Tile[] {
  const next = tiles.map((tile) => ({ ...tile }));
  for (const tile of tiles) {
    if (tile.baseTerrain === "ocean" || tile.baseTerrain === "shallow_water") continue;
    const nearOcean = neighbors(tile.x, tile.y, width, height).some((n) => {
      const terrain = getTile(tiles, n.x, n.y, width).baseTerrain;
      return terrain === "ocean" || terrain === "shallow_water";
    });
    if (nearOcean) next[indexOf(tile.x, tile.y, width)].baseTerrain = "coast";
  }
  for (const tile of tiles) {
    if (tile.baseTerrain !== "ocean") continue;
    const nearLand = neighbors(tile.x, tile.y, width, height).some((n) => isLand(getTile(next, n.x, n.y, width)));
    if (nearLand) next[indexOf(tile.x, tile.y, width)].baseTerrain = "shallow_water";
  }
  return next;
}

function addRivers(tiles: Tile[], options: MapGenerationOptions, random: () => number): Tile[] {
  const { width, height, riverCount } = options;
  const result = tiles.map((tile) => ({ ...tile }));
  const sources = result
    .filter((tile) => tile.feature === "mountain" || tile.feature === "high_mountain")
    .sort((a, b) => b.height - a.height)
    .slice(0, Math.max(1, riverCount * 4));

  for (let i = 0; i < riverCount && sources.length; i += 1) {
    let current = sources[Math.floor(random() * sources.length)];
    const path = new Set<string>();
    for (let step = 0; step < width + height; step += 1) {
      const key = `${current.x}:${current.y}`;
      if (path.has(key)) break;
      path.add(key);
      if (current.baseTerrain === "ocean" || current.baseTerrain === "shallow_water") break;
      if (current.baseTerrain !== "coast") {
        const target = result[indexOf(current.x, current.y, width)];
        if (target.baseTerrain !== "ice" && target.baseTerrain !== "desert") target.baseTerrain = "river";
      }
      const downhill = neighbors(current.x, current.y, width, height)
        .map((n) => getTile(result, n.x, n.y, width))
        .sort((a, b) => a.height - b.height + random() * 0.08);
      const next = downhill.find((tile) => tile.height <= current.height + 0.025) ?? downhill[0];
      if (!next || next === current) break;
      current = next;
    }
  }
  return result;
}

function smoothTerrain(tiles: Tile[], width: number, height: number): Tile[] {
  let result = tiles.map((tile) => ({ ...tile }));
  for (let pass = 0; pass < 2; pass += 1) {
    result = result.map((tile) => {
      if (tile.baseTerrain === "river" || tile.baseTerrain === "coast" || tile.baseTerrain === "shallow_water") return tile;
      const counts = new Map<BaseTerrain, number>();
      neighbors(tile.x, tile.y, width, height).forEach((n) => {
        const terrain = getTile(result, n.x, n.y, width).baseTerrain;
        counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
      });
      const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (dominant && dominant[1] >= 6 && dominant[0] !== "river") return { ...tile, baseTerrain: dominant[0] };
      return tile;
    });
  }
  return result;
}

function fixForbiddenAdjacency(tiles: Tile[], width: number, height: number): Tile[] {
  const forbidden = new Set(["ice:desert", "ice:jungle", "ice:volcanic_land", "jungle:tundra", "desert:jungle"]);
  return tiles.map((tile) => {
    const badNeighbor = neighbors(tile.x, tile.y, width, height).find((n) => {
      const other = getTile(tiles, n.x, n.y, width).baseTerrain;
      return forbidden.has(`${tile.baseTerrain}:${other}`) || forbidden.has(`${other}:${tile.baseTerrain}`);
    });
    if (!badNeighbor) return tile;
    if (tile.baseTerrain === "ice") return { ...tile, baseTerrain: "tundra" };
    if (tile.baseTerrain === "jungle") return { ...tile, baseTerrain: "forest" };
    if (tile.baseTerrain === "desert") return { ...tile, baseTerrain: "grassland" };
    if (tile.baseTerrain === "volcanic_land") return { ...tile, baseTerrain: "wasteland" };
    return { ...tile, baseTerrain: "plain" };
  });
}

function applyBuffers(tiles: Tile[], width: number, height: number): Tile[] {
  return tiles.map((tile) => {
    const around = neighbors(tile.x, tile.y, width, height).map((n) => getTile(tiles, n.x, n.y, width));
    if (tile.baseTerrain === "plain" || tile.baseTerrain === "grassland") {
      if (around.some((n) => n.baseTerrain === "ice")) return { ...tile, baseTerrain: "tundra" };
      if (around.some((n) => n.baseTerrain === "desert")) return { ...tile, baseTerrain: "grassland" };
      if (around.some((n) => n.baseTerrain === "volcanic_land")) return { ...tile, baseTerrain: "wasteland" };
    }
    if (tile.feature === "mountain" || tile.feature === "high_mountain") return tile;
    if (tile.feature === null && around.some((n) => n.feature === "mountain" || n.feature === "high_mountain") && tile.baseTerrain !== "river") {
      return { ...tile, feature: "hill" as Feature };
    }
    return tile;
  });
}

export function generateTileMap(options: MapGenerationOptions, terrainWeights: TerrainWeights = DEFAULT_TERRAIN_WEIGHTS): Tile[] {
  const random = createRandom(options.seed);
  const { width, height } = options;
  const effectiveWeights: TerrainWeights = {
    ...terrainWeights,
    forest: (terrainWeights.forest ?? 1) * options.forestDensity,
    jungle: (terrainWeights.jungle ?? 1) * options.forestDensity,
    desert: (terrainWeights.desert ?? 1) * options.desertDensity,
    ice: (terrainWeights.ice ?? 1) * (0.55 + options.snowLevel),
    tundra: (terrainWeights.tundra ?? 1) * (0.7 + options.snowLevel * 0.6)
  };
  const continents = buildContinents(options, random);
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const latitude = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
      const edgeFalloff = Math.max(Math.abs(x / width - 0.5) * 1.75, Math.abs(y / height - 0.5) * 1.45);
      let continentInfluence = 0;
      let continentId: string | undefined;
      continents.forEach((continent) => {
        const dx = (x - continent.x) / continent.rx;
        const dy = (y - continent.y) / continent.ry;
        const influence = clamp(1 - Math.sqrt(dx * dx + dy * dy));
        if (influence > continentInfluence) {
          continentInfluence = influence;
          continentId = continent.id;
        }
      });
      const noise = fractalNoise(x, y, options.seed);
      const heightValue = clamp(continentInfluence * 0.72 + noise * 0.5 - options.waterLevel * 0.52 - edgeFalloff * 0.2);
      const climateNoise = options.climateMode === "chaotic" ? fractalNoise(x, y, `${options.seed}:temp-chaos`) * 0.5 : 0;
      const fantasyShift = options.climateMode === "fantasy" ? fractalNoise(x, y, `${options.seed}:fantasy`) * 0.28 : 0;
      const temperature = clamp(1 - latitude * (0.78 + options.snowLevel * 0.2) - heightValue * 0.18 + climateNoise + fantasyShift);
      tiles.push({
        x,
        y,
        baseTerrain: "ocean",
        feature: null,
        height: heightValue,
        moisture: 0,
        temperature,
        continentId: heightValue > 0.16 ? continentId : undefined
      });
    }
  }

  const waterAware = tiles.map((tile) => {
    if (tile.height < 0.08) return { ...tile, baseTerrain: "ocean" as BaseTerrain };
    if (tile.height < 0.14) return { ...tile, baseTerrain: "shallow_water" as BaseTerrain };
    return { ...tile, baseTerrain: "plain" as BaseTerrain };
  });

  const withMoisture = waterAware.map((tile) => {
    const moistureNoise = fractalNoise(tile.x, tile.y, `${options.seed}:moisture`);
    const lowlandWater = clamp((0.28 - tile.height) * 2.4);
    const coastBand = clamp(1 - Math.min(tile.x, tile.y, width - tile.x - 1, height - tile.y - 1) / 20);
    return {
      ...tile,
      moisture: clamp(lowlandWater * 0.32 + coastBand * 0.12 + moistureNoise * 0.56)
    };
  });

  let result: Tile[] = withMoisture.map((tile) => ({
    ...tile,
    baseTerrain: initialTerrain(tile, effectiveWeights, random)
  }));
  result = applyCoasts(result, width, height);
  result = result.map((tile) => ({ ...tile, feature: applyFeature(tile, options, effectiveWeights, random) }));
  result = addRivers(result, options, random);
  result = smoothTerrain(result, width, height);
  result = fixForbiddenAdjacency(result, width, height);
  result = applyBuffers(result, width, height);
  result = applyCoasts(result, width, height);

  return result;
}
