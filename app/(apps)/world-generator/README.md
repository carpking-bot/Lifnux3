# World Generator

World Generator is a LIFNUX app module for map-centered worldbuilding management. The map surface is now a rule-based procedural tile generator. It does not use natural-language AI or image generation.

## Implemented MVP

- Project list, project creation, and project metadata editing.
- LocalStorage persistence through `lib/worldGeneratorStorage.ts`.
- Typed models in `types.ts` for `Tile`, `BaseTerrain`, `Feature`, generation options, terrain weights, projects, maps, entities, and relations.
- Tile-based world map generation with deterministic seed behavior.
- Rule-based terrain generation sequence:
  - ocean initialization
  - continent seed placement and blob influence
  - noise-based height map
  - water level land/ocean split
  - coast and shallow-water buffers
  - connected mountain feature placement
  - high-to-low river paths
  - latitude-driven temperature map
  - moisture map
  - suitability scoring plus terrain weights
  - hill/mountain/volcano feature pass
  - smoothing, forbidden adjacency correction, and buffer correction
- Terrain weight sliders where `1.0` is neutral, `0` disables a terrain/feature inside its valid candidate area, and values above/below 1 bias probability without breaking natural rules.
- Canvas tile renderer supporting 100x100 maps and up to 200x200 maps.
- Tile inspector showing terrain, feature, height, moisture, temperature, and continent id.
- Terrain/feature brush editing with brush size.
- Entity create/edit/delete for Character, Faction, Nation, Region, Event, Item, and Location.
- Relation create/edit/delete using a separate relation model.
- Timeline view based on Event entities with text filtering by related entity, tag, date, and description.

## Storage Notes

The current storage key is `lifnux_world_generator_state_v2`.

The previous `lifnux_world_generator_state_v1` key is read once and migrated into tile-map data when needed. The page depends on the `WorldGeneratorStore` interface rather than directly reading LocalStorage. A Supabase, Firebase, or API-backed implementation can replace `LocalStorageWorldGeneratorStore` later without changing the page-level model.

## Future Extension Points

- Generate cities, ports, dungeons, and nation regions from tile suitability scores.
- Export generated maps as PNG or JSON.
- Add per-tile notes and link tiles to WorldEntity records.
- Add more climate models and biome packs.
- Add collaborative persistence and user ownership through the future database store.
- Add AI-assisted ideation only as a separate service after the procedural map model stabilizes.
