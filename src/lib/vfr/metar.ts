export type CloudGroup = {
  group: string;
  type: "FEW" | "SCT" | "BKN" | "OVC" | "VV" | "NSC" | "CAVOK";
  feet?: number;
};

export type CloudParseResult = {
  groups: CloudGroup[];
  condition: "CAVOK" | "NSC" | null;
  unknownCloudGroups: string[];
};

export function parseClouds(metar: string): CloudGroup[] {
  return parseMetarClouds(metar).groups;
}

export function parseMetarClouds(metar: string): CloudParseResult {
  const upper = metar.toUpperCase();
  if (/\bCAVOK\b/.test(upper)) return { groups: [], condition: "CAVOK", unknownCloudGroups: [] };
  if (/\bNSC\b/.test(upper)) return { groups: [], condition: "NSC", unknownCloudGroups: [] };

  const groups: CloudGroup[] = [];
  const unknownCloudGroups: string[] = [];
  for (const raw of upper.split(/\s+/)) {
    const match = raw.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
    if (!match) {
      if (/^(FEW|SCT|BKN|OVC|VV|SKC|CLR)/.test(raw)) unknownCloudGroups.push(raw);
      continue;
    }
    groups.push({
      group: raw,
      type: match[1] as CloudGroup["type"],
      feet: Number(match[2]) * 100,
    });
  }
  return { groups, condition: null, unknownCloudGroups };
}

export function maxAltFor(groups: CloudGroup[]) {
  const max = Math.max(3000, ...groups.map((g) => g.feet ?? 0));
  return Math.ceil(max / 1000) * 1000;
}
