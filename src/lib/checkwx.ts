export type CheckWxValueSet = {
  kts?: number;
  mps?: number;
  kph?: number;
  mph?: number;
};

export type CheckWxCloud = {
  code?: string;
  feet?: number;
  meters?: number;
  text?: string;
  type?: {
    code?: string;
    text?: string;
  };
};

export type CheckWxMetar = {
  icao?: string;
  raw_text?: string;
  observed?: string;
  flight_category?: string;
  report?: { type?: string; status?: string };
  wind?: {
    degrees?: number;
    speed?: CheckWxValueSet;
    gust?: CheckWxValueSet;
    text?: string;
  };
  visibility?: {
    text?: string;
    meters?: number;
    miles?: number;
  };
  temperature?: {
    celsius?: number;
    fahrenheit?: number;
  };
  dewpoint?: {
    celsius?: number;
    fahrenheit?: number;
  };
  pressure?: {
    mb?: number;
    hg?: number;
  };
  humidity?: number | { percent?: number };
  clouds?: CheckWxCloud[];
  conditions?: Array<{ code?: string; text?: string }>;
};

export type CheckWxTafForecast = {
  section?: string;
  timestamp?: {
    from?: string;
    to?: string;
  };
  change?: {
    code?: string;
    period?: {
      from?: string;
      to?: string;
    };
    indicator?: string;
    probability?: number;
    text?: string;
  };
  wind?: CheckWxMetar["wind"];
  visibility?: CheckWxMetar["visibility"];
  clouds?: CheckWxCloud[];
  conditions?: CheckWxMetar["conditions"];
  raw_text?: string;
};

export type CheckWxTaf = {
  icao?: string;
  raw_text?: string;
  issued?: string;
  period?: {
    from?: string;
    to?: string;
  };
  forecast?: CheckWxTafForecast[];
};

type CheckWxEnvelope<T> = {
  results?: number;
  data?: T[];
  error?: string;
};

export type CheckWxWeather = {
  metarStatus: number;
  tafStatus: number;
  metar: CheckWxEnvelope<CheckWxMetar>;
  taf: CheckWxEnvelope<CheckWxTaf>;
};

export async function fetchCheckWxWeather(icao: string, signal?: AbortSignal) {
  const response = await fetch(`/api/checkwx/${encodeURIComponent(icao)}`, { signal });
  const data = (await response.json()) as CheckWxWeather | { error?: string };

  if (!response.ok) {
    const message = "error" in data ? data.error : undefined;
    throw new Error(message ?? `CheckWX request failed with HTTP ${response.status}.`);
  }

  return data as CheckWxWeather;
}
