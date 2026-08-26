export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";

export type WeatherCloud = {
  cover: string;
  baseFt: number | null;
  type?: string | null;
};

export type WeatherWind = {
  direction: number | "VRB" | null;
  speedKt: number | null;
  gustKt: number | null;
};

export type TafSegment = {
  id: string;
  type: "BASE" | "BECMG" | "TEMPO" | "PROB30" | "PROB40" | "FM" | "OTHER";
  probability: number | null;
  from: string | null;
  to: string | null;
  becomingAt?: string | null;
  wind: WeatherWind;
  visibilitySm: number | null;
  visibilityText: string;
  weather: string | null;
  clouds: WeatherCloud[];
  raw?: string;
};

export type WeatherStation = {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  hasMetar: boolean;
  provider: "aviationweather" | "checkwx";
  reportType: "METAR" | "SPECI" | "UNKNOWN";
  rawMetar: string | null;
  rawTaf: string | null;
  observedAt: string | null;
  issuedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  category: FlightCategory;
  ceilingFt: number | null;
  visibilitySm: number | null;
  visibilityText: string;
  wind: WeatherWind;
  temperatureC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
  clouds: WeatherCloud[];
  weather: string | null;
  tafSegments: TafSegment[];
};
