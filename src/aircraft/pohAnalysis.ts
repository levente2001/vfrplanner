export type PohPage = {
  page: number;
  text: string;
  rotation: number;
  group: string | null;
};

export function chartGroup(text: string): string | null {
  const compact = text.toLowerCase().replace(/[^a-z0-9°]/g, "");
  if (/tableofcontents|listoffigures/.test(compact)) return null;
  const takeoff = /takeoff/.test(compact);
  const landing = /landing(distance|groundroll)/.test(compact);
  const axes =
    /weight/.test(compact) &&
    /temperature|airtemp/.test(compact) &&
    /wind/.test(compact);
  if (
    (!takeoff && !landing) ||
    !axes ||
    !/groundroll|barrier|obstacle|performance|landingdistance/.test(compact)
  )
    return null;
  // Long prose pages and flight-planning examples are context, not charts.
  if (
    !/associatedconditions/.test(compact) &&
    !(
      /pressurealtitude/.test(compact) &&
      /groundroll/.test(compact) &&
      /distance/.test(compact)
    )
  )
    return null;
  const flap = text.match(
    /(?:^|[^\d])(\d{1,2})\s*[°o]?\s*flaps\s*(?:take[\s-]*off|landing)/i,
  )?.[1];
  return takeoff ? `takeoff-${flap ?? "unknown"}` : "landing";
}

export function dominantTextRotation(
  items: Array<{ str: string; transform: number[] }>,
): number {
  const weights = [0, 0, 0, 0];
  for (const item of items) {
    const angle =
      (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI;
    const quadrant = ((Math.round(angle / 90) % 4) + 4) % 4;
    weights[quadrant] += item.str.replace(/\s/g, "").length;
  }
  return weights.indexOf(Math.max(...weights)) * 90;
}

export function parsePageSelection(value: string, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const piece of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const match = piece.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use PDF page numbers, e.g. 109-112, 125-126.");
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount)
      throw new Error(`Page numbers must be between 1 and ${pageCount}.`);
    if (end - start > 23)
      throw new Error("Select at most 24 relevant chart pages per import.");
    for (let page = start; page <= end; page++) pages.add(page);
  }
  if (!pages.size || pages.size > 24)
    throw new Error("Select 1–24 relevant chart pages per import.");
  return [...pages].sort((a, b) => a - b);
}

export function groupPohPages(pages: PohPage[]): PohPage[][] {
  const groups = new Map<string, PohPage[]>();
  for (const page of pages) {
    const key = page.group ?? "manual";
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  const batches: PohPage[][] = [];
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += 4)
      batches.push(group.slice(index, index + 4));
  }
  return batches;
}
