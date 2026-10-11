import type { Leg, WaypointMeta } from "@/lib/vfr/nav";

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export type NavlogType = "VFR" | "CPL";

type NavlogExportInput = {
  navlogType?: NavlogType;
  waypoints: WaypointMeta[];
  legs: Leg[];
  totalDistance: number;
  totalTime: number;
  totalFuel: number;
  fuelUnit: "L" | "USG";
  fuelUnitLabel: string;
  windDirection?: number;
  windSpeed?: number;
  alternateFuel?: number;
  msaByLeg?: Array<number | null>;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const L_TO_US_GAL = 0.2641720524;
const FIXED_FUEL_USG = {
  reserve: 6,
  extra: 4,
  taxi: 1,
};
export const NAVLOG_WAYPOINT_LIMIT = 19;
export const NAVLOG_LEG_LIMIT = 18;
const encoder = new TextEncoder();

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function toArrayBuffer(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

function writeUint16(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeBytes(out: number[], data: Uint8Array) {
  for (const byte of data) out.push(byte);
}

function writeZip(entries: ZipEntry[]) {
  const out: number[] = [];
  const central: number[] = [];
  const metadata = entries.map((entry) => ({
    ...entry,
    nameBytes: encoder.encode(entry.name),
    crc: crc32(entry.data),
    offset: 0,
  }));

  for (const entry of metadata) {
    entry.offset = out.length;
    writeUint32(out, 0x04034b50);
    writeUint16(out, 20);
    writeUint16(out, 0);
    writeUint16(out, 0);
    writeUint16(out, 0);
    writeUint16(out, 0);
    writeUint32(out, entry.crc);
    writeUint32(out, entry.data.length);
    writeUint32(out, entry.data.length);
    writeUint16(out, entry.nameBytes.length);
    writeUint16(out, 0);
    writeBytes(out, entry.nameBytes);
    writeBytes(out, entry.data);
  }

  const centralOffset = out.length;
  for (const entry of metadata) {
    writeUint32(central, 0x02014b50);
    writeUint16(central, 20);
    writeUint16(central, 20);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, entry.crc);
    writeUint32(central, entry.data.length);
    writeUint32(central, entry.data.length);
    writeUint16(central, entry.nameBytes.length);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, 0);
    writeUint32(central, entry.offset);
    writeBytes(central, entry.nameBytes);
  }
  writeBytes(out, new Uint8Array(central));

  writeUint32(out, 0x06054b50);
  writeUint16(out, 0);
  writeUint16(out, 0);
  writeUint16(out, entries.length);
  writeUint16(out, entries.length);
  writeUint32(out, central.length);
  writeUint32(out, centralOffset);
  writeUint16(out, 0);

  return new Uint8Array(out);
}

export function navlogMinutesText(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return "";
  return `${Math.round(hours * 60)} min`;
}

function usGallonsToExportUnit(value: number, fuelUnit: NavlogExportInput["fuelUnit"]) {
  return fuelUnit === "USG" ? value : value / L_TO_US_GAL;
}

function fuelText(value: number, unitLabel: string) {
  return `${value.toFixed(1)} ${unitLabel}`;
}

export function navlogFuelSummary(input: Pick<NavlogExportInput, "totalFuel" | "fuelUnit" | "fuelUnitLabel" | "alternateFuel">) {
  const contingency = input.totalFuel * 0.05;
  const alternate = Math.max(0, input.alternateFuel ?? 0);
  const reserve = usGallonsToExportUnit(FIXED_FUEL_USG.reserve, input.fuelUnit);
  const extra = usGallonsToExportUnit(FIXED_FUEL_USG.extra, input.fuelUnit);
  const taxi = usGallonsToExportUnit(FIXED_FUEL_USG.taxi, input.fuelUnit);
  const block = input.totalFuel + contingency + alternate + reserve + extra + taxi;

  return [
    { label: "trip", value: input.totalFuel, text: fuelText(input.totalFuel, input.fuelUnitLabel) },
    { label: "cont. 5%", value: contingency, text: fuelText(contingency, input.fuelUnitLabel) },
    { label: "alternate", value: alternate, text: fuelText(alternate, input.fuelUnitLabel) },
    { label: "reserve", value: reserve, text: fuelText(reserve, input.fuelUnitLabel) },
    { label: "extra", value: extra, text: fuelText(extra, input.fuelUnitLabel) },
    { label: "taxi", value: taxi, text: fuelText(taxi, input.fuelUnitLabel) },
    { label: "Block", value: block, text: fuelText(block, input.fuelUnitLabel) },
  ];
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let n = index;
  let out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

type CellValue = string | number | null | undefined;
type CellMap = Record<string, { value?: CellValue; style?: number }>;

function cellXml(ref: string, value: CellValue, style = 3) {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}" s="${style}"/>`;
  }
  if (typeof value === "number") {
    const safe = Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
    return `<c r="${ref}" s="${style}"><v>${safe}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function rowXml(
  row: number,
  cells: CellMap,
  styleForColumn: (col: number) => number,
  height = 20,
  columnCount = 12,
) {
  const rendered: string[] = [];
  for (let col = 1; col <= columnCount; col++) {
    const ref = `${columnName(col)}${row}`;
    const entry = cells[ref];
    rendered.push(cellXml(ref, entry?.value, entry?.style ?? styleForColumn(col)));
  }
  return `<row r="${row}" ht="${height}" customHeight="1">${rendered.join("")}</row>`;
}

function commonPackageEntries(sheetXml: string, sheetName: string): ZipEntry[] {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029"/>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="9"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="9"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="16"/><name val="Arial"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  return [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(styles) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
  ];
}

function worksheetXml(
  rows: string[],
  merges: string[],
  maxRow: number,
  columnWidths: number[],
) {
  const cols = columnWidths
    .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const maxColumn = columnName(columnWidths.length);
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${maxColumn}${maxRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>${rows.join("")}</sheetData>
  ${mergeXml}
  <pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}

function set(cells: CellMap, ref: string, value: CellValue, style?: number) {
  cells[ref] = { value, style };
}

function threeDigits(value: number) {
  return String(((Math.round(value) % 360) + 360) % 360).padStart(3, "0");
}

function windVector(input: NavlogExportInput, leg?: Leg) {
  const direction = Number.isFinite(leg?.windDirection)
    ? Math.round(leg?.windDirection ?? 0)
    : Number.isFinite(input.windDirection)
      ? Math.round(input.windDirection ?? 0)
      : 0;
  const speed = Number.isFinite(leg?.windSpeed)
    ? Math.round(leg?.windSpeed ?? 0)
    : Number.isFinite(input.windSpeed)
      ? Math.round(input.windSpeed ?? 0)
      : 0;
  return threeDigits(direction) + `/${speed}`;
}

function validateCapacity(input: NavlogExportInput) {
  if (input.waypoints.length > NAVLOG_WAYPOINT_LIMIT || input.legs.length > NAVLOG_LEG_LIMIT) {
    throw new Error(
      `Navlog export supports up to ${NAVLOG_WAYPOINT_LIMIT} waypoints and ${NAVLOG_LEG_LIMIT} legs. Split the route before exporting.`,
    );
  }
}

function buildVfrSheet(input: NavlogExportInput) {
  const cells: CellMap = {};
  const merges: string[] = [
    "A1:K1",
    "A2:C2", "D2:G2", "H2:K2",
    "A3:C3", "D3:G3", "H3:K3",
    "A4:B4", "C4:D4",
    "F4:F5", "G4:H5", "I4:J5", "K4:K5",
  ];

  set(cells, "A1", "NAVIGATION LOG", 1);
  set(cells, "A2", "Call sign:", 6);
  set(cells, "D2", "Squawk:", 6);
  set(cells, "H2", "QNH:", 6);
  set(cells, "A3", "OFF-block:", 6);
  set(cells, "D3", "ON-Block:", 6);
  set(cells, "H3", "Flight time:", 6);

  set(cells, "A4", "Waypoint name", 2);
  set(cells, "C4", "ETO", 2);
  set(cells, "E4", "ATO", 2);
  set(cells, "F4", "Leg time", 2);
  set(cells, "G4", "Dist. (nm)", 2);
  set(cells, "I4", "Mag. Track", 2);
  set(cells, "K4", "True track", 2);

  for (let i = 0; i < NAVLOG_WAYPOINT_LIMIT; i++) {
    const top = 5 + i * 2;
    const bottom = top + 1;
    merges.push(
      `A${top}:B${bottom}`,
      `C${top}:D${bottom}`,
      `E${top}:E${bottom}`,
    );
    set(cells, `A${top}`, input.waypoints[i]?.label ?? "", 3);
  }

  for (let i = 0; i < NAVLOG_LEG_LIMIT; i++) {
    const top = 6 + i * 2;
    const bottom = top + 1;
    merges.push(
      `F${top}:F${bottom}`,
      `G${top}:H${bottom}`,
      `I${top}:J${bottom}`,
      `K${top}:K${bottom}`,
    );
    const leg = input.legs[i];
    if (!leg) continue;
    set(cells, `F${top}`, navlogMinutesText(leg.ete));
    set(cells, `G${top}`, Math.round(leg.distance));
    set(cells, `I${top}`, threeDigits(leg.magneticCourse));
    set(cells, `K${top}`, threeDigits(leg.trueCourse));
  }

  // Keep the lower section at the exact rows used by the supplied VFR template.
  // Rows 43–46 intentionally remain as the template's spare route rows.
  merges.push("A47:D47");
  set(cells, "A47", "Total:", 7);
  set(cells, "F47", navlogMinutesText(input.totalTime), 7);
  set(cells, "G47", Math.round(input.totalDistance), 7);

  merges.push("A48:C48", "D48:G48", "H48:K48");
  set(cells, "A48", "NAV/COM frequencies", 5);
  set(cells, "H48", "Fuel calculation", 5);

  const fuel = navlogFuelSummary(input);
  for (let i = 0; i < 7; i++) {
    const row = 49 + i;
    merges.push(`H${row}:I${row}`, `J${row}:K${row}`);
    set(cells, `H${row}`, fuel[i]?.label ?? "", i === 6 ? 7 : 3);
    set(cells, `J${row}`, fuel[i]?.text ?? "", i === 6 ? 7 : 3);
  }

  merges.push("D55:E55", "F55:G55");
  set(cells, "D55", "Emergency", 6);
  set(cells, "F55", "121.500", 3);

  merges.push("A56:K56", "A57:K59");
  set(cells, "A56", "Remarks:", 5);

  const rows: string[] = [];
  for (let row = 1; row <= 59; row++) {
    const height =
      row === 1 ? 26 :
      row === 4 || row === 5 ? 23 :
      row === 48 || row === 56 ? 20 :
      18;
    rows.push(
      rowXml(
        row,
        cells,
        () =>
          row === 1 ? 1 :
          row === 4 || row === 48 || row === 56 ? 5 :
          row === 47 ? 4 :
          3,
        height,
        11,
      ),
    );
  }

  return worksheetXml(
    rows,
    merges,
    59,
    [13, 8, 9, 8, 9, 9, 8, 8, 9, 9, 10],
  );
}

function buildCplSheet(input: NavlogExportInput) {
  const cells: CellMap = {};
  const merges: string[] = [
    "A1:L1",
    "A2:D2", "E2:H2", "I2:L2",
    "A3:C3", "D3:F3", "G3:I3", "J3:L3",
    "A4:C4",
    "F4:F5", "G4:G5", "H4:H5", "I4:I5", "J4:J5", "K4:K5", "L4:L5",
  ];

  set(cells, "A1", "NAVIGATION LOG", 1);
  set(cells, "A2", "Call sign:", 6);
  set(cells, "E2", "Squawk:", 6);
  set(cells, "I2", "QNH:", 6);
  set(cells, "A3", "OFF-block:", 6);
  set(cells, "D3", "ON-Block:", 6);
  set(cells, "G3", "Flight time:", 6);
  set(cells, "J3", "CVLTWL", 6);

  const headers = [
    ["A4", "Waypoint name"],
    ["D4", "ETO"],
    ["E4", "ATO"],
    ["F4", "Leg time"],
    ["G4", "Dist. (nm)"],
    ["H4", "Mag. HDG"],
    ["I4", "W/V"],
    ["J4", "Mag. Track"],
    ["K4", "Alt"],
    ["L4", "MSA"],
  ] as const;
  headers.forEach(([ref, value]) => set(cells, ref, value, 2));

  for (let i = 0; i < NAVLOG_WAYPOINT_LIMIT; i++) {
    const top = 5 + i * 2;
    const bottom = top + 1;
    merges.push(
      `A${top}:C${bottom}`,
      `D${top}:D${bottom}`,
      `E${top}:E${bottom}`,
    );
    set(cells, `A${top}`, input.waypoints[i]?.label ?? "", 3);
  }

  for (let i = 0; i < NAVLOG_LEG_LIMIT; i++) {
    const top = 6 + i * 2;
    const bottom = top + 1;
    for (const col of ["F", "G", "H", "I", "J", "K", "L"]) {
      merges.push(`${col}${top}:${col}${bottom}`);
    }
    const leg = input.legs[i];
    if (!leg) continue;
    set(cells, `F${top}`, navlogMinutesText(leg.ete));
    set(cells, `G${top}`, Math.round(leg.distance));
    set(cells, `H${top}`, threeDigits(leg.magneticHeading));
    set(cells, `I${top}`, windVector(input, leg));
    set(cells, `J${top}`, threeDigits(leg.magneticCourse));
    set(cells, `K${top}`, leg.altitudeFt ? Math.round(leg.altitudeFt) : "");
    const msa = input.msaByLeg?.[i];
    set(cells, `L${top}`, msa == null ? "" : Math.round(msa));
  }

  merges.push("A43:D43", "E43:H43", "I43:L43");
  set(cells, "A43", "NAV/COM frequencies", 5);
  set(cells, "I43", "Fuel calculation", 5);

  const fuel = navlogFuelSummary(input);
  for (let i = 0; i < 7; i++) {
    const row = 44 + i;
    merges.push(`I${row}:J${row}`, `K${row}:L${row}`);
    set(cells, `I${row}`, fuel[i]?.label ?? "", i === 6 ? 7 : 3);
    set(cells, `K${row}`, fuel[i]?.text ?? "", i === 6 ? 7 : 3);
  }

  const navRows = [
    [44, "NAV 1", ""],
    [45, "NAV 2", ""],
    [46, "COM 1", ""],
    [47, "COM 2", ""],
    [48, "ATIS / INFO", ""],
    [49, "Standby", ""],
    [50, "Emergency", "121.500"],
  ] as const;
  navRows.forEach(([row, label, value]) => {
    merges.push(`A${row}:D${row}`, `E${row}:H${row}`);
    set(cells, `A${row}`, label, 6);
    set(cells, `E${row}`, value, 3);
  });

  merges.push("A51:I51");
  set(cells, "A51", "Fuel monitoring", 5);
  const monitoringHeaders = [
    ["A52", "Time"],
    ["B52", "Fuel in tanks"],
    ["C52", "Fuel rmg."],
    ["D52", "Consumption G/h"],
    ["F52", "Safe endurance"],
    ["H52", "ETA at limit of safe endurance"],
  ] as const;
  monitoringHeaders.forEach(([ref, value]) => set(cells, ref, value, 2));
  merges.push(
    "A52:A53", "B52:B53", "C52:C53",
    "D52:E53", "F52:G53", "H52:I53",
  );
  for (let row = 54; row <= 58; row++) {
    merges.push(`D${row}:E${row}`, `F${row}:G${row}`, `H${row}:I${row}`);
  }

  merges.push("A59:I59", "A60:I61", "J51:L61");
  set(cells, "A59", "Remarks:", 5);

  const rows: string[] = [];
  for (let row = 1; row <= 61; row++) {
    const height =
      row === 1 ? 26 :
      row === 4 || row === 5 ? 23 :
      row === 43 || row === 51 || row === 59 ? 20 :
      18;
    rows.push(
      rowXml(
        row,
        cells,
        () =>
          row === 1 ? 1 :
          row === 4 || row === 43 || row === 51 || row === 59 ? 5 :
          3,
        height,
        12,
      ),
    );
  }

  return worksheetXml(
    rows,
    merges,
    61,
    [13, 8, 8, 9, 9, 9, 9, 10, 10, 10, 9, 9],
  );
}

export function buildNavlogXlsxBytes(input: NavlogExportInput) {
  validateCapacity(input);
  const type = input.navlogType ?? "VFR";
  const sheetXml = type === "CPL" ? buildCplSheet(input) : buildVfrSheet(input);
  return writeZip(commonPackageEntries(sheetXml, type === "CPL" ? "NAVLOG 3" : "NAVLOG 1"));
}

export async function exportNavlogXlsx(input: NavlogExportInput) {
  const type = input.navlogType ?? "VFR";
  const xlsx = buildNavlogXlsxBytes(input);
  const blob = new Blob([toArrayBuffer(xlsx)], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}_NAVLOG_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}