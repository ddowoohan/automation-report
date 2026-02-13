const AGENCY_ALIAS_MAP: Record<string, string> = {
  DM대전둔산2: "DM대구칠성",
  DM송파오금: "DM공간플러스"
};

const CLUB_1000_SET = new Set([
  "DM대구칠성",
  "DM공간플러스",
  "DM부산센텀",
  "DM송파문정",
  "DM오피스그룹",
  "DM에스엔피",
  "DM더라이즈",
  "DM드림OC"
]);

export function normalizeAgencyName(name: string): string {
  const trimmed = (name || "").trim();
  return AGENCY_ALIAS_MAP[trimmed] ?? trimmed;
}

export function isClub1000Agency(name: string): boolean {
  return CLUB_1000_SET.has(normalizeAgencyName(name));
}

export function getClub1000Agencies(): string[] {
  return Array.from(CLUB_1000_SET);
}
