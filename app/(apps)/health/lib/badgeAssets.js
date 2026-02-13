const BRONZE = "/health/badges/default-medal.svg";
export function getBadgeImageSrc(badgeId) {
    if (badgeId.startsWith("global-"))
        return BRONZE;
    if (badgeId.startsWith("activity-first-"))
        return BRONZE;
    if (badgeId.startsWith("distance-"))
        return BRONZE;
    if (badgeId.startsWith("count-"))
        return BRONZE;
    if (badgeId.startsWith("special-"))
        return BRONZE;
    return BRONZE;
}

