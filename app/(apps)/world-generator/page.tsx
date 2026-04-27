"use client";

import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Map as MapIcon, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { AppShell } from "../../(shared)/components/AppShell";
import type {
  BaseTerrain,
  EntityType,
  Feature,
  MapGenerationOptions,
  MapMarker,
  MapRegion,
  RelationType,
  TerrainWeights,
  Tile,
  WorldEntity,
  WorldGeneratorState,
  WorldGeneratorView,
  WorldMap,
  WorldProject,
  WorldRelation
} from "./types";
import { worldGeneratorId, worldGeneratorNow, worldGeneratorStore } from "./lib/worldGeneratorStorage";
import {
  BASE_TERRAINS,
  DEFAULT_GENERATION_OPTIONS,
  DEFAULT_TERRAIN_WEIGHTS,
  FEATURES,
  FEATURE_COLORS,
  TERRAIN_COLORS,
  generateTileMap
} from "./lib/tileWorldGenerator";

const ENTITY_TYPES: EntityType[] = ["Character", "Faction", "Nation", "Region", "Event", "Item", "Location"];
const RELATION_TYPES: RelationType[] = [
  "belongs_to",
  "enemy_of",
  "allied_with",
  "mentor_of",
  "located_in",
  "involved_in",
  "caused_by",
  "custom"
];

type Selection = { kind: "entity"; id: string } | { kind: "relation"; id: string } | null;
type TilePaintMode = "terrain" | "feature";

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-1)]">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-[var(--ink-0)] outline-none focus:border-[var(--accent-1)]",
        props.className
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "min-h-[88px] w-full resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-[var(--ink-0)] outline-none focus:border-[var(--accent-1)]",
        props.className
      )}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "lifnux-select w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none focus:border-[var(--accent-1)]",
        props.className
      )}
    />
  );
}

function SmallButton({
  children,
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-[var(--accent-1)] bg-[rgba(90,214,208,0.14)] text-white"
          : "border-white/10 bg-white/5 text-[var(--ink-1)] hover:border-white/25 hover:text-white",
        className
      )}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--ink-1)]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function getProjectScope(state: WorldGeneratorState, projectId?: string) {
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
  const map = state.maps.find((item) => item.id === project?.selectedMapId) ?? state.maps.find((item) => item.projectId === project?.id);
  return { project, map };
}

export default function WorldGeneratorPage() {
  const [state, setState] = useState<WorldGeneratorState>(() => ({
    projects: [],
    maps: [],
    layers: [],
    markers: [],
    regions: [],
    entities: [],
    relations: []
  }));
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<WorldGeneratorView>("map");
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    setState(worldGeneratorStore.load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    worldGeneratorStore.save(state);
  }, [state, hydrated]);

  const { project, map } = useMemo(() => getProjectScope(state, state.selectedProjectId), [state]);
  const projectEntities = useMemo(() => state.entities.filter((item) => item.projectId === project?.id), [state.entities, project?.id]);
  const entityById = useMemo(() => new Map(projectEntities.map((entity) => [entity.id, entity])), [projectEntities]);

  const updateState = (updater: (current: WorldGeneratorState) => WorldGeneratorState) => setState((current) => updater(current));

  const createProject = () => {
    setState(worldGeneratorStore.createProject(`New World ${state.projects.length + 1}`, "Procedural tile world project"));
    setSelection(null);
    setView("map");
  };

  const updateProject = (patch: Partial<WorldProject>) => {
    if (!project) return;
    updateState((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === project.id ? { ...item, ...patch, updatedAt: worldGeneratorNow() } : item))
    }));
  };

  const updateMap = (id: string, patch: Partial<WorldMap>) => {
    updateState((current) => ({
      ...current,
      maps: current.maps.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: worldGeneratorNow() } : item))
    }));
  };

  const createEntity = (type: EntityType = "Character") => {
    if (!project) return;
    const now = worldGeneratorNow();
    const entity: WorldEntity = {
      id: worldGeneratorId("entity"),
      projectId: project.id,
      name: `New ${type}`,
      type,
      description: "",
      tags: [],
      relatedEntityIds: [],
      timelineDate: type === "Event" ? "Year 1" : undefined,
      createdAt: now,
      updatedAt: now
    };
    updateState((current) => ({ ...current, entities: [entity, ...current.entities] }));
    setSelection({ kind: "entity", id: entity.id });
  };

  const updateEntity = (id: string, patch: Partial<WorldEntity>) => {
    updateState((current) => ({
      ...current,
      entities: current.entities.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: worldGeneratorNow() } : item))
    }));
  };

  const deleteEntity = (id: string) => {
    updateState((current) => ({
      ...current,
      entities: current.entities.filter((item) => item.id !== id),
      relations: current.relations.filter((rel) => rel.sourceEntityId !== id && rel.targetEntityId !== id),
      markers: current.markers.map((marker) => ({ ...marker, relatedEntityIds: marker.relatedEntityIds.filter((entityId) => entityId !== id) })),
      regions: current.regions.map((region) => ({ ...region, relatedEntityIds: region.relatedEntityIds.filter((entityId) => entityId !== id) }))
    }));
    setSelection(null);
  };

  const createRelation = () => {
    if (!project || projectEntities.length < 2) return;
    const relation: WorldRelation = {
      id: worldGeneratorId("relation"),
      projectId: project.id,
      sourceEntityId: projectEntities[0].id,
      targetEntityId: projectEntities[1].id,
      relationType: "belongs_to",
      description: "",
      createdAt: worldGeneratorNow()
    };
    updateState((current) => ({ ...current, relations: [relation, ...current.relations] }));
    setSelection({ kind: "relation", id: relation.id });
  };

  const updateRelation = (id: string, patch: Partial<WorldRelation>) => {
    updateState((current) => ({
      ...current,
      relations: current.relations.map((item) => (item.id === id ? { ...item, ...patch } : item))
    }));
  };

  const deleteRelation = (id: string) => {
    updateState((current) => ({ ...current, relations: current.relations.filter((item) => item.id !== id) }));
    setSelection(null);
  };

  if (!project || !map) {
    return (
      <AppShell title="World Generator">
        <div className="flex min-h-[70vh] items-center justify-center">
          <SmallButton onClick={createProject}>
            <Plus className="h-4 w-4" /> Create World Project
          </SmallButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="World Generator">
      <div className={cx("grid gap-4", view === "map" ? "lg:grid-cols-[230px_minmax(0,1fr)]" : "lg:grid-cols-[230px_minmax(0,1fr)_320px]")}>
        <WorldSidebar
          view={view}
          setView={setView}
          project={project}
          projects={state.projects}
          selectProject={(id) => setState({ ...state, selectedProjectId: id })}
          createProject={createProject}
        />
        <section className="min-w-0">
          {view === "home" ? <HomeView project={project} updateProject={updateProject} state={state} projectEntities={projectEntities} map={map} /> : null}
          {view === "map" ? <TileMapGenerator map={map} updateMap={updateMap} /> : null}
          {view === "entities" ? (
            <EntitiesView
              entities={projectEntities}
              createEntity={createEntity}
              setSelection={setSelection}
              selectedId={selection?.kind === "entity" ? selection.id : undefined}
            />
          ) : null}
          {view === "timeline" ? <TimelineView entities={projectEntities} entityById={entityById} setSelection={setSelection} /> : null}
          {view === "relations" ? (
            <RelationsView
              relations={state.relations.filter((item) => item.projectId === project.id)}
              entities={projectEntities}
              entityById={entityById}
              createRelation={createRelation}
              setSelection={setSelection}
              selectedId={selection?.kind === "relation" ? selection.id : undefined}
            />
          ) : null}
        </section>
        {view !== "map" ? (
          <DetailPanel
            selection={selection}
            projectId={project.id}
            state={state}
            entities={projectEntities}
            entityById={entityById}
            updateEntity={updateEntity}
            deleteEntity={deleteEntity}
            updateRelation={updateRelation}
            deleteRelation={deleteRelation}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function WorldSidebar({
  view,
  setView,
  project,
  projects,
  selectProject,
  createProject
}: {
  view: WorldGeneratorView;
  setView: (view: WorldGeneratorView) => void;
  project: WorldProject;
  projects: WorldProject[];
  selectProject: (id: string) => void;
  createProject: () => void;
}) {
  const items: Array<{ id: WorldGeneratorView; label: string }> = [
    { id: "home", label: "Home" },
    { id: "map", label: "Map Generator" },
    { id: "entities", label: "Entities" },
    { id: "timeline", label: "Timeline" },
    { id: "relations", label: "Relations" }
  ];
  return (
    <aside className="lifnux-glass h-fit rounded-2xl p-4">
      <div className="mb-4">
        <FieldLabel>Project</FieldLabel>
        <SelectInput value={project.id} onChange={(event) => selectProject(event.target.value)} className="mt-2">
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectInput>
        <SmallButton className="mt-2 w-full" onClick={createProject}>
          <Plus className="h-4 w-4" /> New Project
        </SmallButton>
      </div>
      <nav className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            className={cx(
              "w-full rounded-xl px-3 py-3 text-left text-sm transition",
              view === item.id ? "bg-white/12 text-white" : "text-[var(--ink-1)] hover:bg-white/7 hover:text-white"
            )}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function HomeView({
  project,
  updateProject,
  state,
  projectEntities,
  map
}: {
  project: WorldProject;
  updateProject: (patch: Partial<WorldProject>) => void;
  state: WorldGeneratorState;
  projectEntities: WorldEntity[];
  map: WorldMap;
}) {
  const relations = state.relations.filter((item) => item.projectId === project.id);
  return (
    <div className="space-y-4">
      <div className="lifnux-glass rounded-2xl p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Project Name</FieldLabel>
            <TextInput className="mt-2" value={project.name} onChange={(event) => updateProject({ name: event.target.value })} />
          </div>
          <div>
            <FieldLabel>Storage</FieldLabel>
            <div className="mt-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-[var(--ink-1)]">
              LocalStorage key: lifnux_world_generator_state_v2
            </div>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <TextArea className="mt-2" value={project.description} onChange={(event) => updateProject({ description: event.target.value })} />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tiles", map.tiles?.length ?? 0],
          ["Entities", projectEntities.length],
          ["Events", projectEntities.filter((entity) => entity.type === "Event").length],
          ["Relations", relations.length]
        ].map(([label, value]) => (
          <div key={label} className="lifnux-glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{label}</div>
            <div className="mt-3 text-3xl">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TileMapGenerator({ map, updateMap }: { map: WorldMap; updateMap: (id: string, patch: Partial<WorldMap>) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [options, setOptions] = useState<MapGenerationOptions>(map.generationOptions ?? DEFAULT_GENERATION_OPTIONS);
  const [weights, setWeights] = useState<TerrainWeights>(map.terrainWeights ?? DEFAULT_TERRAIN_WEIGHTS);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(map.tiles?.[0] ?? null);
  const [paintMode, setPaintMode] = useState<TilePaintMode>("terrain");
  const [paintTerrain, setPaintTerrain] = useState<BaseTerrain>("plain");
  const [paintFeature, setPaintFeature] = useState<Feature>("hill");
  const [brushSize, setBrushSize] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const tileSize = map.tileSize ?? 6;
  const displayScale = Math.max(0.5, Math.min(6, zoom));
  const tiles = map.tiles ?? [];

  useEffect(() => {
    setOptions(map.generationOptions ?? DEFAULT_GENERATION_OPTIONS);
    setWeights(map.terrainWeights ?? DEFAULT_TERRAIN_WEIGHTS);
    setSelectedTile(map.tiles?.[0] ?? null);
  }, [map.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tiles.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tiles.forEach((tile) => {
      ctx.fillStyle = TERRAIN_COLORS[tile.baseTerrain];
      ctx.fillRect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
      if (tile.feature) {
        ctx.fillStyle = FEATURE_COLORS[tile.feature];
        const inset = tile.feature === "hill" ? tileSize * 0.26 : tileSize * 0.16;
        ctx.fillRect(tile.x * tileSize + inset, tile.y * tileSize + inset, tileSize - inset * 2, tileSize - inset * 2);
      }
      if (showGrid && tileSize >= 5) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
      }
    });
    if (selectedTile) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(selectedTile.x * tileSize + 1, selectedTile.y * tileSize + 1, tileSize - 2, tileSize - 2);
    }
  }, [tiles, tileSize, selectedTile, showGrid]);

  const patchOptions = (patch: Partial<MapGenerationOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
  };

  const generate = () => {
    const normalized = {
      ...options,
      width: Math.max(20, Math.min(200, Math.round(options.width))),
      height: Math.max(20, Math.min(200, Math.round(options.height)))
    };
    const generated = generateTileMap(normalized, weights);
    updateMap(map.id, {
      width: normalized.width,
      height: normalized.height,
      generationOptions: normalized,
      terrainWeights: weights,
      tiles: generated
    });
    setOptions(normalized);
    setSelectedTile(generated[0] ?? null);
  };

  const updateWeight = (key: BaseTerrain | NonNullable<Feature>, value: number) => {
    setWeights((current) => ({ ...current, [key]: value }));
  };

  const tileFromEvent = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / rect.width;
    const scaleY = event.currentTarget.height / rect.height;
    const x = Math.floor(((event.clientX - rect.left) * scaleX) / tileSize);
    const y = Math.floor(((event.clientY - rect.top) * scaleY) / tileSize);
    return tiles.find((tile) => tile.x === x && tile.y === y) ?? null;
  };

  const paintTile = (tile: Tile) => {
    const radius = Math.max(0, brushSize - 1);
    const edited = tiles.map((current) => {
      if (Math.abs(current.x - tile.x) > radius || Math.abs(current.y - tile.y) > radius) return current;
      if (paintMode === "terrain") {
        return {
          ...current,
          baseTerrain: paintTerrain,
          feature: paintTerrain === "ocean" || paintTerrain === "shallow_water" || paintTerrain === "lake" || paintTerrain === "river" ? null : current.feature
        };
      }
      return { ...current, feature: paintFeature };
    });
    updateMap(map.id, { tiles: edited });
    setSelectedTile(edited.find((item) => item.x === tile.x && item.y === tile.y) ?? tile);
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const tile = tileFromEvent(event);
    if (!tile) return;
    setSelectedTile(tile);
    paintTile(tile);
  };

  const saveSettings = () => {
    updateMap(map.id, { generationOptions: options, terrainWeights: weights });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_280px]">
      <aside className="lifnux-glass h-fit rounded-2xl p-4">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <MapIcon className="h-4 w-4" /> Generation
        </div>
        <div className="space-y-3">
          <div>
            <FieldLabel>Seed</FieldLabel>
            <TextInput className="mt-2" value={options.seed} onChange={(event) => patchOptions({ seed: event.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Width</FieldLabel>
              <TextInput className="mt-2" type="number" min={20} max={200} value={options.width} onChange={(event) => patchOptions({ width: Number(event.target.value) })} />
            </div>
            <div>
              <FieldLabel>Height</FieldLabel>
              <TextInput className="mt-2" type="number" min={20} max={200} value={options.height} onChange={(event) => patchOptions({ height: Number(event.target.value) })} />
            </div>
          </div>
          <Slider label="Continents" min={1} max={8} step={1} value={options.continentCount} onChange={(value) => patchOptions({ continentCount: value })} />
          <Slider label="Water Level" min={0.25} max={0.78} step={0.01} value={options.waterLevel} onChange={(value) => patchOptions({ waterLevel: value })} />
          <Slider label="Mountains" min={0} max={1.5} step={0.01} value={options.mountainDensity} onChange={(value) => patchOptions({ mountainDensity: value })} />
          <Slider label="Rivers" min={0} max={32} step={1} value={options.riverCount} onChange={(value) => patchOptions({ riverCount: value })} />
          <Slider label="Forests" min={0} max={1.5} step={0.01} value={options.forestDensity} onChange={(value) => patchOptions({ forestDensity: value })} />
          <Slider label="Deserts" min={0} max={1.5} step={0.01} value={options.desertDensity} onChange={(value) => patchOptions({ desertDensity: value })} />
          <Slider label="Snow Level" min={0} max={1} step={0.01} value={options.snowLevel} onChange={(value) => patchOptions({ snowLevel: value })} />
          <div>
            <FieldLabel>Climate Mode</FieldLabel>
            <SelectInput className="mt-2" value={options.climateMode} onChange={(event) => patchOptions({ climateMode: event.target.value as MapGenerationOptions["climateMode"] })}>
              <option value="earthlike">earthlike</option>
              <option value="fantasy">fantasy</option>
              <option value="chaotic">chaotic</option>
            </SelectInput>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SmallButton onClick={generate}>
              <Sparkles className="h-4 w-4" /> Generate
            </SmallButton>
            <SmallButton onClick={saveSettings}>
              <Save className="h-4 w-4" /> Save
            </SmallButton>
          </div>
        </div>
      </aside>

      <section className="lifnux-glass min-w-0 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
          <SmallButton active={paintMode === "terrain"} onClick={() => setPaintMode("terrain")}>Terrain Brush</SmallButton>
          <SmallButton active={paintMode === "feature"} onClick={() => setPaintMode("feature")}>Feature Brush</SmallButton>
          <SelectInput className="max-w-[170px]" value={paintTerrain} onChange={(event) => setPaintTerrain(event.target.value as BaseTerrain)}>
            {BASE_TERRAINS.map((terrain) => <option key={terrain}>{terrain}</option>)}
          </SelectInput>
          <SelectInput className="max-w-[160px]" value={paintFeature ?? ""} onChange={(event) => setPaintFeature((event.target.value || null) as Feature)}>
            <option value="">none</option>
            {FEATURES.map((feature) => <option key={feature}>{feature}</option>)}
          </SelectInput>
          <Slider label="Brush" min={1} max={5} step={1} value={brushSize} onChange={setBrushSize} />
          <SmallButton onClick={() => setZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))}>-</SmallButton>
          <span className="w-14 text-center text-xs text-[var(--ink-1)]">{Math.round(displayScale * 100)}%</span>
          <SmallButton onClick={() => setZoom((current) => Math.min(6, Number((current + 0.25).toFixed(2))))}>+</SmallButton>
          <SmallButton onClick={() => setZoom(1)}>Reset</SmallButton>
          <SmallButton active={showGrid} onClick={() => setShowGrid((current) => !current)}>Grid</SmallButton>
        </div>
        <div className="lifnux-scroll h-[72vh] overflow-auto bg-[#091018] p-4">
          <canvas
            ref={canvasRef}
            width={(map.width || options.width) * tileSize}
            height={(map.height || options.height) * tileSize}
            className="max-w-none cursor-crosshair rounded border border-white/10"
            style={{
              width: `${(map.width || options.width) * tileSize * displayScale}px`,
              height: `${(map.height || options.height) * tileSize * displayScale}px`,
              imageRendering: "pixelated"
            }}
            onClick={handleCanvasClick}
          />
        </div>
      </section>

      <aside className="lifnux-glass h-fit max-h-[82vh] overflow-y-auto rounded-2xl p-4 lifnux-scroll">
        <div className="mb-4 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Selected Tile</div>
        {selectedTile ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Info label="X" value={selectedTile.x} />
              <Info label="Y" value={selectedTile.y} />
            </div>
            <Info label="Terrain" value={selectedTile.baseTerrain} color={TERRAIN_COLORS[selectedTile.baseTerrain]} />
            <Info label="Feature" value={selectedTile.feature ?? "none"} color={selectedTile.feature ? FEATURE_COLORS[selectedTile.feature] : undefined} />
            <Info label="Height" value={selectedTile.height.toFixed(3)} />
            <Info label="Moisture" value={selectedTile.moisture.toFixed(3)} />
            <Info label="Temperature" value={selectedTile.temperature.toFixed(3)} />
            <Info label="Continent" value={selectedTile.continentId ?? "none"} />
          </div>
        ) : (
          <div className="text-sm text-[var(--ink-1)]">Click a tile to inspect and edit it.</div>
        )}
        <div className="mt-6">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Terrain Weights</div>
          <div className="space-y-3">
            {[...BASE_TERRAINS.filter((terrain) => terrain !== "custom"), ...FEATURES].map((key) => (
              <Slider key={key} label={key} min={0} max={2} step={0.05} value={weights[key] ?? 1} onChange={(value) => updateWeight(key, value)} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-1)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        {color ? <span className="h-3 w-3 rounded-sm border border-white/20" style={{ backgroundColor: color }} /> : null}
        <span className="break-all text-sm">{value}</span>
      </div>
    </div>
  );
}

function EntitiesView({
  entities,
  createEntity,
  setSelection,
  selectedId
}: {
  entities: WorldEntity[];
  createEntity: (type?: EntityType) => void;
  setSelection: (selection: Selection) => void;
  selectedId?: string;
}) {
  const [filter, setFilter] = useState<EntityType | "All">("All");
  const filtered = filter === "All" ? entities : entities.filter((entity) => entity.type === filter);
  return (
    <div className="lifnux-glass rounded-2xl p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SelectInput value={filter} onChange={(event) => setFilter(event.target.value as EntityType | "All")} className="max-w-[180px]">
          <option value="All">All Types</option>
          {ENTITY_TYPES.map((type) => <option key={type}>{type}</option>)}
        </SelectInput>
        <SmallButton onClick={() => createEntity(filter === "All" ? "Character" : filter)}>
          <Plus className="h-4 w-4" /> New Entity
        </SmallButton>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((entity) => (
          <button
            key={entity.id}
            className={cx(
              "rounded-xl border p-4 text-left transition",
              selectedId === entity.id ? "border-[var(--accent-1)] bg-white/10" : "border-white/10 bg-black/20 hover:border-white/25"
            )}
            onClick={() => setSelection({ kind: "entity", id: entity.id })}
          >
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-1)]">{entity.type}</div>
            <div className="mt-2 text-lg">{entity.name}</div>
            <div className="mt-2 line-clamp-3 text-sm text-[var(--ink-1)]">{entity.description || "No description"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelineView({
  entities,
  entityById,
  setSelection
}: {
  entities: WorldEntity[];
  entityById: Map<string, WorldEntity>;
  setSelection: (selection: Selection) => void;
}) {
  const [filter, setFilter] = useState("");
  const events = entities
    .filter((entity) => entity.type === "Event")
    .filter((event) => {
      const query = filter.trim().toLowerCase();
      if (!query) return true;
      const related = event.relatedEntityIds.map((id) => entityById.get(id)?.name ?? "").join(" ");
      return `${event.name} ${event.timelineDate ?? ""} ${event.description} ${event.tags.join(" ")} ${related}`.toLowerCase().includes(query);
    });
  return (
    <div className="lifnux-glass rounded-2xl p-4">
      <TextInput placeholder="Filter by character, nation, region, tag, or date" value={filter} onChange={(event) => setFilter(event.target.value)} />
      <div className="mt-5 space-y-3">
        {events.map((event) => (
          <button
            key={event.id}
            className="grid w-full gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left hover:border-white/25 md:grid-cols-[170px_minmax(0,1fr)]"
            onClick={() => setSelection({ kind: "entity", id: event.id })}
          >
            <div className="text-sm text-[var(--accent-1)]">{event.timelineDate || "Undated"}</div>
            <div>
              <div className="text-lg">{event.name}</div>
              <div className="mt-1 text-sm text-[var(--ink-1)]">{event.description || "No description"}</div>
              <div className="mt-2 text-xs text-[var(--ink-1)]">
                Related: {event.relatedEntityIds.map((id) => entityById.get(id)?.name).filter(Boolean).join(", ") || "None"}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function RelationsView({
  relations,
  entities,
  entityById,
  createRelation,
  setSelection,
  selectedId
}: {
  relations: WorldRelation[];
  entities: WorldEntity[];
  entityById: Map<string, WorldEntity>;
  createRelation: () => void;
  setSelection: (selection: Selection) => void;
  selectedId?: string;
}) {
  return (
    <div className="lifnux-glass rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-[var(--ink-1)]">{relations.length} relations</div>
        <SmallButton onClick={createRelation} disabled={entities.length < 2}>
          <GitBranch className="h-4 w-4" /> New Relation
        </SmallButton>
      </div>
      <div className="space-y-3">
        {relations.map((relation) => (
          <button
            key={relation.id}
            className={cx(
              "w-full rounded-xl border p-4 text-left",
              selectedId === relation.id ? "border-[var(--accent-1)] bg-white/10" : "border-white/10 bg-black/20 hover:border-white/25"
            )}
            onClick={() => setSelection({ kind: "relation", id: relation.id })}
          >
            <div className="text-sm">
              {entityById.get(relation.sourceEntityId)?.name ?? "Missing"} {"->"} {entityById.get(relation.targetEntityId)?.name ?? "Missing"}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--ink-1)]">{relation.relationType}</div>
            <div className="mt-2 text-sm text-[var(--ink-1)]">{relation.description || "No description"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  selection,
  state,
  projectId,
  entities,
  entityById,
  updateEntity,
  deleteEntity,
  updateRelation,
  deleteRelation
}: {
  selection: Selection;
  state: WorldGeneratorState;
  projectId: string;
  entities: WorldEntity[];
  entityById: Map<string, WorldEntity>;
  updateEntity: (id: string, patch: Partial<WorldEntity>) => void;
  deleteEntity: (id: string) => void;
  updateRelation: (id: string, patch: Partial<WorldRelation>) => void;
  deleteRelation: (id: string) => void;
}) {
  if (!selection) {
    return <aside className="lifnux-glass h-fit rounded-2xl p-4 text-sm text-[var(--ink-1)]">Select an entity or relation to edit details.</aside>;
  }
  const entity = selection.kind === "entity" ? state.entities.find((item) => item.id === selection.id) : undefined;
  const relation = selection.kind === "relation" ? state.relations.find((item) => item.id === selection.id && item.projectId === projectId) : undefined;

  return (
    <aside className="lifnux-glass h-fit rounded-2xl p-4">
      <div className="mb-4 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Detail Panel</div>
      {entity ? (
        <EntityForm entity={entity} entities={entities.filter((item) => item.id !== entity.id)} updateEntity={updateEntity} deleteEntity={deleteEntity} />
      ) : null}
      {relation ? (
        <div className="space-y-3">
          <FieldLabel>Source</FieldLabel>
          <SelectInput value={relation.sourceEntityId} onChange={(event) => updateRelation(relation.id, { sourceEntityId: event.target.value })}>
            {entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectInput>
          <FieldLabel>Target</FieldLabel>
          <SelectInput value={relation.targetEntityId} onChange={(event) => updateRelation(relation.id, { targetEntityId: event.target.value })}>
            {entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectInput>
          <FieldLabel>Relation Type</FieldLabel>
          <SelectInput value={relation.relationType} onChange={(event) => updateRelation(relation.id, { relationType: event.target.value as RelationType })}>
            {RELATION_TYPES.map((type) => <option key={type}>{type}</option>)}
          </SelectInput>
          <FieldLabel>Description</FieldLabel>
          <TextArea value={relation.description} onChange={(event) => updateRelation(relation.id, { description: event.target.value })} />
          <div className="text-xs text-[var(--ink-1)]">
            {entityById.get(relation.sourceEntityId)?.name ?? "Missing"} {"->"} {entityById.get(relation.targetEntityId)?.name ?? "Missing"}
          </div>
          <SmallButton className="w-full border-red-400/30 text-red-200" onClick={() => deleteRelation(relation.id)}>
            <Trash2 className="h-4 w-4" /> Delete Relation
          </SmallButton>
        </div>
      ) : null}
    </aside>
  );
}

function EntityForm({
  entity,
  entities,
  updateEntity,
  deleteEntity
}: {
  entity: WorldEntity;
  entities: WorldEntity[];
  updateEntity: (id: string, patch: Partial<WorldEntity>) => void;
  deleteEntity: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <FieldLabel>Name</FieldLabel>
      <TextInput value={entity.name} onChange={(event) => updateEntity(entity.id, { name: event.target.value })} />
      <FieldLabel>Type</FieldLabel>
      <SelectInput value={entity.type} onChange={(event) => updateEntity(entity.id, { type: event.target.value as EntityType })}>
        {ENTITY_TYPES.map((option) => <option key={option}>{option}</option>)}
      </SelectInput>
      <FieldLabel>Description</FieldLabel>
      <TextArea value={entity.description} onChange={(event) => updateEntity(entity.id, { description: event.target.value })} />
      <FieldLabel>Tags</FieldLabel>
      <TextInput value={entity.tags.join(", ")} onChange={(event) => updateEntity(entity.id, { tags: splitTags(event.target.value) })} />
      <FieldLabel>Related Entities</FieldLabel>
      <select
        multiple
        className="lifnux-select h-32 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none"
        value={entity.relatedEntityIds}
        onChange={(event) => updateEntity(entity.id, { relatedEntityIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}
      >
        {entities.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({item.type})
          </option>
        ))}
      </select>
      <FieldLabel>Image URL</FieldLabel>
      <TextInput value={entity.imageUrl ?? ""} onChange={(event) => updateEntity(entity.id, { imageUrl: event.target.value })} />
      {entity.type === "Event" ? (
        <>
          <FieldLabel>Timeline Date / Era</FieldLabel>
          <TextInput value={entity.timelineDate ?? ""} onChange={(event) => updateEntity(entity.id, { timelineDate: event.target.value })} />
        </>
      ) : null}
      <SmallButton className="w-full border-red-400/30 text-red-200" onClick={() => deleteEntity(entity.id)}>
        <Trash2 className="h-4 w-4" /> Delete
      </SmallButton>
    </div>
  );
}
