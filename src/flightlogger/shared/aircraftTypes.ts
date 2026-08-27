export type AircraftApiResponse = {
  aircraft: FlightLoggerAircraft[];
  pageInfo: {
    endCursor?: string | null;
    hasNextPage: boolean;
  };
  fetchedPages: number;
  total: number;
  cached?: boolean;
  partial?: boolean;
  warning?: string;
};

export type FlightLoggerAirport = {
  id?: string;
  name?: string;
};

export type FlightLoggerLogConfig = {
  id?: string;
  type?: string;
  measurementType?: string;
  totalSeconds?: number | null;
  durationWarningPercent?: number | null;
  offsetWarningSecondsStart?: number | null;
  offsetWarningSecondsEnd?: number | null;
  actionButtonsIsEnabled?: boolean;
  prefillIsEnabled?: boolean;
};

export type FlightLoggerMaintenanceType = {
  name?: string;
  disabled?: boolean;
  expiresOnCycles?: boolean;
  expiresOnDate?: boolean;
  expiresOnLog?: string | null;
  requireSerialNumber?: boolean | null;
  requireUploadOfDocument?: boolean | null;
  triggerOnLogTime?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FlightLoggerMaintenancePart = {
  id?: string;
  name?: string;
  serialNumber?: string | null;
  status?: string | null;
  expirationCycles?: number | null;
  expirationDate?: string | null;
  expirationLogSeconds?: number | null;
  expiresOnLog?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  maintenanceType?: FlightLoggerMaintenanceType | null;
};

export type FlightLoggerServiceSummary = {
  cyclesWarningColor?: string | null;
  dateWarningColor?: string | null;
  nextPrimaryService?: number | null;
  nextSecondaryService?: number | null;
  nextServiceCycles?: number | null;
  nextServiceDate?: string | null;
  nextTertiaryService?: number | null;
  primaryWarningColor?: string | null;
  secondaryWarningColor?: string | null;
  tertiaryWarningColor?: string | null;
};

export type FlightLoggerMaintenanceWarning = {
  id?: string;
  color?: string | null;
  cyclesLeft?: number | null;
  daysLeft?: number | null;
  expiryCycles?: string | null;
  expiryDate?: string | null;
  expiryTime?: number | null;
  hasDocument?: boolean;
  logMeasurementType?: string;
  logType?: string | null;
  requirers?: string[];
  serialNumber?: string | null;
  status?: string;
  subjectName?: string;
  timeLeft?: number | null;
  typeOfTimer?: string | null;
  typeOfTimerMeasurement?: string;
};

export type FlightLoggerAircraft = {
  id: string;
  callSign: string;
  model: string;
  aircraftClass?: string;
  aircraftType?: string;
  currentAirport?: FlightLoggerAirport | null;
  homeAirport?: FlightLoggerAirport | null;
  defaultEngineType?: string | null;
  defaultPMF?: string | null;
  disabled?: boolean;
  fuelCoefficient?: number | null;
  fuelCoefficientMeasurement?: string | null;
  fuelCoefficientUnit?: string | null;
  taxiInTime?: number | null;
  taxiOutTime?: number | null;
  timerSeconds?: number | null;
  totalAirborneMinutes?: number | null;
  totalFuel?: number | null;
  totalLandings?: number | null;
  typeOfTimer?: string | null;
  typeOfTimerMeasurement?: string | null;
  primaryLog?: FlightLoggerLogConfig | null;
  secondaryLog?: FlightLoggerLogConfig | null;
  tertiaryLog?: FlightLoggerLogConfig | null;
  nextService?: FlightLoggerServiceSummary | null;
  worstMaintenanceWarning?: FlightLoggerMaintenanceWarning | null;
  worstWarning?: FlightLoggerMaintenanceWarning | null;
  maintenanceParts: FlightLoggerMaintenancePart[];
  raw: Record<string, unknown>;
};
