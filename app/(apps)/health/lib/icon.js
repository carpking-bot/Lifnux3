const ICON_BY_ID = {
    running: "🏃",
    walking: "🚶",
    bicycle: "🚴",
    swimming: "🏊",
    home: "🏠",
    soccer: "⚽",
    gym: "🏋️",
    tennis: "🎾",
    test_distance: "🧪",
    test_count: "🔢"
};
const LEGACY_ICON_KEYS = ["run", "walk", "bicycle", "swim", "home", "soccer", "gym", "tennis"];
export function resolveActivityIcon(typeId, storedIcon) {
    if (storedIcon && !LEGACY_ICON_KEYS.includes(storedIcon))
        return storedIcon;
    return ICON_BY_ID[typeId];
}

