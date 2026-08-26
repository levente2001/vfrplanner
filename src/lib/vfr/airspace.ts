export type Airspace = {
  name: string;
  classCode: string;
  type: string;
  lowerLimit: string;
  upperLimit: string;
  points: Array<[number, number]>;
};

function parseOpenAirCoord(value: string): [number, number] | null {
  const match = value.match(
    /(\d{1,2}):(\d{1,2}):(\d{1,2})\s*([NS])\s+(\d{1,3}):(\d{1,2}):(\d{1,2})\s*([EW])/i,
  );
  if (!match) return null;
  const lat =
    Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
  const lon =
    Number(match[5]) + Number(match[6]) / 60 + Number(match[7]) / 3600;
  return [
    match[4]!.toUpperCase() === "S" ? -lat : lat,
    match[8]!.toUpperCase() === "W" ? -lon : lon,
  ];
}

export function parseOpenAir(text: string): Airspace[] {
  const result: Airspace[] = [];
  let current: Airspace | null = null;

  function commit() {
    if (current && current.points.length >= 3) result.push(current);
    current = null;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*")) continue;
    const key = line.slice(0, 2).toUpperCase();
    const value = line.slice(2).trim();

    if (key === "AC") {
      commit();
      current = {
        name: "Unnamed airspace",
        classCode: value,
        type: "",
        lowerLimit: "",
        upperLimit: "",
        points: [],
      };
      continue;
    }

    if (!current) continue;
    if (key === "AN") current.name = value;
    if (key === "AY") current.type = value;
    if (key === "AL") current.lowerLimit = value;
    if (key === "AH") current.upperLimit = value;
    if (key === "DP") {
      const point = parseOpenAirCoord(value);
      if (point) current.points.push(point);
    }
  }

  commit();
  return result;
}
