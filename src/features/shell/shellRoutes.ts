export type SettingsPanel = "mediaServices" | "player" | "appearance" | "logs";

export type MediaDetailSource =
  | {
      from: "favorites" | "home";
      parentTrail: string[];
    }
  | {
      from: "library";
      libraryId: string | null;
      parentTrail: string[];
    };

export const defaultSettingsPanel: SettingsPanel = "mediaServices";

const settingsPanelSegments = {
  appearance: "appearance",
  logs: "logs",
  mediaServices: "media-services",
  player: "player",
} satisfies Record<SettingsPanel, string>;

const settingsPanelsBySegment = new Map(
  Object.entries(settingsPanelSegments).map(([panel, segment]) => [
    segment,
    panel as SettingsPanel,
  ]),
);

export function homePath() {
  return "/home";
}

export function favoritesPath() {
  return "/favorites";
}

export function searchPath() {
  return "/search";
}

export function settingsPath(
  panel: SettingsPanel,
  options: { addServer?: boolean } = {},
) {
  const query = options.addServer ? "?addServer=1" : "";
  return `/settings/${settingsPanelSegments[panel]}${query}`;
}

export function parseSettingsPanel(panelSegment: string | undefined): SettingsPanel {
  return settingsPanelsBySegment.get(panelSegment ?? "") ?? defaultSettingsPanel;
}

export function libraryPath(serverId: string, libraryId: string) {
  return `/servers/${encodePathSegment(serverId)}/libraries/${encodePathSegment(libraryId)}`;
}

export function mediaDetailPath({
  from,
  itemId,
  libraryId,
  parentTrail = [],
  serverId,
}: {
  from: MediaDetailSource["from"];
  itemId: string;
  libraryId?: string | null;
  parentTrail?: string[];
  serverId: string;
}) {
  const params = new URLSearchParams();
  params.set("from", from);

  if (from === "library" && libraryId) {
    params.set("libraryId", libraryId);
  }

  for (const parentId of parentTrail) {
    params.append("parent", parentId);
  }

  return `/servers/${encodePathSegment(serverId)}/items/${encodePathSegment(itemId)}?${params.toString()}`;
}

export function parseMediaDetailSource(searchParams: URLSearchParams): MediaDetailSource {
  const parentTrail = searchParams.getAll("parent").filter(Boolean);
  const from = searchParams.get("from");

  if (from === "favorites") {
    return { from: "favorites", parentTrail };
  }

  if (from === "library") {
    return {
      from: "library",
      libraryId: searchParams.get("libraryId"),
      parentTrail,
    };
  }

  return { from: "home", parentTrail };
}

export function appendParent(source: MediaDetailSource, parentId: string): string[] {
  return [...source.parentTrail, parentId];
}

export function getDetailBackPath(serverId: string, source: MediaDetailSource) {
  const parentId = source.parentTrail[source.parentTrail.length - 1];

  if (parentId) {
    return mediaDetailPath({
      from: source.from,
      itemId: parentId,
      libraryId: source.from === "library" ? source.libraryId : null,
      parentTrail: source.parentTrail.slice(0, -1),
      serverId,
    });
  }

  if (source.from === "favorites") {
    return favoritesPath();
  }

  if (source.from === "library" && source.libraryId) {
    return libraryPath(serverId, source.libraryId);
  }

  return homePath();
}

export function getDetailReturnLabelKey(source: MediaDetailSource) {
  if (source.parentTrail.length > 0) {
    return "nav.home";
  }

  if (source.from === "favorites") {
    return "nav.favorites";
  }

  return "nav.home";
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}
