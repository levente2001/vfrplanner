export type PerformancePoint = {
  weightKg: number;
  pressureAltitudeFt: number;
  temperatureC: number;
  headwindKt: number;
  slopePercent: number;
  groundRollM: number;
  distanceM: number;
  accelerateStopM: number | null;
};

export type PerformanceProfile = {
  id: string;
  name: string;
  phase: "takeoff" | "landing";
  documentId: string;
  source: string;
  configuration: string;
  surface: "paved" | "grass" | "other";
  condition: "dry" | "wet" | "other";
  obstacleHeightFt: number;
  interpolation: "linear" | "exact";
  verified: boolean;
  points: PerformancePoint[];
  extraction?: {
    documentSha256: string;
    model: string;
    createdAt: string;
    pages: number[];
    warnings: string[];
    method: "table" | "chart" | "example";
    rowEvidence: string[];
  };
};

export type AircraftDocument = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  storagePath: string;
};

export type Aircraft = {
  id: string;
  registration: string;
  type: string;
  notes: string;
  documents: AircraftDocument[];
  profiles: PerformanceProfile[];
  updatedAt: string;
};
