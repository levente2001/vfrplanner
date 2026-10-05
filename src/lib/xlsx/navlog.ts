import type { Leg, WaypointMeta } from "@/lib/vfr/nav";

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export type NavlogType = "VFR" | "IFR";

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
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const L_TO_US_GAL = 0.2641720524;
const FIXED_FUEL_USG = {
  reserve: 6,
  extra: 4,
  taxi: 1,
};
export const NAVLOG_WAYPOINT_LIMIT = 15;
export const NAVLOG_LEG_LIMIT = 14;
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

export function navlogFuelSummary(input: Pick<NavlogExportInput, "totalFuel" | "fuelUnit" | "fuelUnitLabel">) {
  const contingency = input.totalFuel * 0.05;
  const reserve = usGallonsToExportUnit(FIXED_FUEL_USG.reserve, input.fuelUnit);
  const extra = usGallonsToExportUnit(FIXED_FUEL_USG.extra, input.fuelUnit);
  const taxi = usGallonsToExportUnit(FIXED_FUEL_USG.taxi, input.fuelUnit);
  const block = input.totalFuel + contingency + reserve + extra + taxi;

  return [
    { label: "trip", value: input.totalFuel, text: fuelText(input.totalFuel, input.fuelUnitLabel) },
    { label: "cont. 5%", value: contingency, text: fuelText(contingency, input.fuelUnitLabel) },
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

function rowXml(row: number, cells: CellMap, styleForColumn: (col: number) => number, height = 20) {
  const rendered: string[] = [];
  for (let col = 1; col <= 12; col++) {
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
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F7F7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF333333"/></left><right style="thin"><color rgb="FF333333"/></right><top style="thin"><color rgb="FF333333"/></top><bottom style="thin"><color rgb="FF333333"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
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

function worksheetXml(rows: string[], merges: string[], maxRow: number) {
  const cols = [13, 7, 7, 10, 10, 10, 10, 11, 11, 11, 11, 11]
    .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:L${maxRow}"/>
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
  return `${((direction % 360) + 360) % 360}`.padStart(3, "0") + `/${speed}`;
}

function validateCapacity(input: NavlogExportInput) {
  if (input.waypoints.length > NAVLOG_WAYPOINT_LIMIT || input.legs.length > NAVLOG_LEG_LIMIT) {
    throw new Error(
      `Navlog export supports up to ${NAVLOG_WAYPOINT_LIMIT} waypoints and ${NAVLOG_LEG_LIMIT} legs. Split the route before exporting.`,
    );
  }
}

function commonInfo(cells: CellMap, title: string) {
  set(cells, "A1", title, 1);
  set(cells, "A2", "Call sign:", 6);
  set(cells, "D2", "Squawk:", 6);
  set(cells, "F2", "Date:", 6);
  set(cells, "I2", "QNH:", 6);
  set(cells, "A3", "OFF-block:", 6);
  set(cells, "D3", "ON-block:", 6);
  set(cells, "G3", "Flight time:", 6);
  set(cells, "J3", "Aircraft:", 6);
}

function commonTopMerges() {
  return ["A1:L1", "A2:C2", "D2:E2", "F2:H2", "I2:L2", "A3:C3", "D3:F3", "G3:I3", "J3:L3", "A4:C4"];
}

function buildVfrSheet(input: NavlogExportInput) {
  const cells: CellMap = {};
  const merges = commonTopMerges();
  commonInfo(cells, "VFR NAVIGATION LOG");
  const headers = [
    ["A4", "Waypoint name"], ["D4", "ATO"], ["E4", "ETO"], ["F4", "Leg time"],
    ["G4", "Dist. (nm)"], ["H4", "W/V"], ["I4", "Mag. Track"], ["J4", "WCA"],
    ["K4", "True Track"], ["L4", "Alt / MSA"],
  ] as const;
  headers.forEach(([ref, value]) => set(cells, ref, value, 2));

  for (let i = 0; i < NAVLOG_WAYPOINT_LIMIT; i++) {
    const row = 5 + i * 2;
    merges.push(`A${row}:C${row}`);
    set(cells, `A${row}`, input.waypoints[i]?.label ?? "", 7);
  }
  for (let i = 0; i < NAVLOG_LEG_LIMIT; i++) {
    const row = 6 + i * 2;
    const leg = input.legs[i];
    if (!leg) continue;
    set(cells, `F${row}`, navlogMinutesText(leg.ete));
    set(cells, `G${row}`, Math.round(leg.distance));
    set(cells, `H${row}`, windVector(input, leg));
    set(cells, `I${row}`, Math.round(leg.magneticCourse));
    set(cells, `J${row}`, Math.round(leg.wca));
    set(cells, `K${row}`, Math.round(leg.trueCourse));
  }
  merges.push("A34:E34");
  set(cells, "A34", "TOTAL", 7);
  set(cells, "F34", navlogMinutesText(input.totalTime), 7);
  set(cells, "G34", Math.round(input.totalDistance), 7);

  merges.push("A36:H36", "I36:L36", "A37:H43");
  set(cells, "A36", "NAV / COM frequencies & remarks", 5);
  set(cells, "I36", "Fuel calculation", 5);
  const fuel = navlogFuelSummary(input);
  const fuelRows = [37, 38, 40, 41, 42, 43];
  fuelRows.forEach((row, i) => {
    merges.push(`I${row}:J${row}`, `K${row}:L${row}`);
    set(cells, `I${row}`, fuel[i]?.label ?? "", i === fuelRows.length - 1 ? 7 : 3);
    set(cells, `K${row}`, fuel[i]?.text ?? "", i === fuelRows.length - 1 ? 7 : 3);
  });
  merges.push("I39:J39", "K39:L39");
  set(cells, "I39", "alternate");

  const rows: string[] = [];
  for (let row = 1; row <= 43; row++) {
    const height = row === 1 ? 28 : row === 4 ? 30 : 20;
    rows.push(
      rowXml(
        row,
        cells,
        () => (row === 1 ? 1 : row === 4 ? 2 : row === 36 ? 5 : row >= 37 ? 3 : row % 2 === 0 && row >= 6 && row <= 32 ? 4 : 3),
        height,
      ),
    );
  }
  return worksheetXml(rows, merges, 43);
}

function buildIfrSheet(input: NavlogExportInput) {
  const cells: CellMap = {};
  const merges = commonTopMerges();
  commonInfo(cells, "NAVIGATION LOG");
  const headers = [
    ["A4", "Waypoint name"], ["D4", "ETO"], ["E4", "ATO"], ["F4", "Leg time"],
    ["G4", "Dist. (nm)"], ["H4", "Mag. HDG"], ["I4", "W/V"], ["J4", "Mag. Track"],
    ["K4", "Alt"], ["L4", "MSA"],
  ] as const;
  headers.forEach(([ref, value]) => set(cells, ref, value, 2));

  for (let i = 0; i < NAVLOG_WAYPOINT_LIMIT; i++) {
    const top = 5 + i * 2;
    const bottom = top + 1;
    merges.push(`A${top}:C${bottom}`, `D${top}:D${bottom}`, `E${top}:E${bottom}`);
    set(cells, `A${top}`, input.waypoints[i]?.label ?? "", 7);
  }

  const wv = windVector(input);
  for (let i = 0; i < NAVLOG_LEG_LIMIT; i++) {
    const top = 6 + i * 2;
    const bottom = top + 1;
    for (const col of ["F", "G", "H", "I", "J", "K", "L"]) merges.push(`${col}${top}:${col}${bottom}`);
    const leg = input.legs[i];
    if (!leg) continue;
    set(cells, `F${top}`, navlogMinutesText(leg.ete));
    set(cells, `G${top}`, Math.round(leg.distance));
    set(cells, `H${top}`, Math.round(leg.magneticHeading));
    set(cells, `I${top}`, windVector(input, leg));
    set(cells, `J${top}`, Math.round(leg.magneticCourse));
  }
  merges.push("H34:L34");

  merges.push("A35:H35", "I35:L35");
  set(cells, "A35", "NAV/COM frequencies", 5);
  set(cells, "I35", "Fuel calculation", 5);
  const fuel = navlogFuelSummary(input);
  const fuelValues = [fuel[0], fuel[1], null, fuel[2], fuel[3], fuel[4], fuel[5]];
  const fuelLabels = ["trip", "cont. 5%", "alternate", "reserve", "extra", "taxi", "Block"];
  for (let i = 0; i < 7; i++) {
    const row = 36 + i;
    merges.push(`I${row}:J${row}`, `K${row}:L${row}`);
    set(cells, `I${row}`, fuelLabels[i], i === 6 ? 7 : 3);
    set(cells, `K${row}`, fuelValues[i]?.text ?? "", i === 6 ? 7 : 3);
  }

  const navRows = [
    [36, "NAV 1", ""], [37, "NAV 2", ""], [38, "COM 1", ""], [39, "COM 2", ""],
    [40, "ATIS / INFO", ""], [41, "Standby", ""], [42, "Emergency", "121.500"],
  ] as const;
  navRows.forEach(([row, label, value]) => {
    merges.push(`A${row}:D${row}`, `E${row}:H${row}`);
    set(cells, `A${row}`, label, 6);
    set(cells, `E${row}`, value, 3);
  });

  merges.push("A43:L43");
  set(cells, "A43", "Fuel monitoring", 5);
  const monitor = [
    ["A44", "Time"], ["B44", "Fuel in tanks"], ["D44", "Fuel rmg."], ["F44", "Consumption G/h"],
    ["H44", "Safe endurance"], ["J44", "ETA at limit of safe endurance"],
  ] as const;
  monitor.forEach(([ref, value]) => set(cells, ref, value, 2));
  merges.push("B44:C44", "D44:E44", "F44:G44", "H44:I44", "J44:L44");

  merges.push("A51:L51", "A52:L54");
  set(cells, "A51", "Remarks:", 5);

  const rows: string[] = [];
  for (let row = 1; row <= 54; row++) {
    const height = row === 1 ? 28 : row === 4 ? 30 : 19;
    rows.push(
      rowXml(
        row,
        cells,
        () => (row === 1 ? 1 : row === 4 || row === 44 ? 2 : row === 35 || row === 43 || row === 51 ? 5 : row >= 5 && row <= 34 && row % 2 === 0 ? 4 : 3),
        height,
      ),
    );
  }
  return worksheetXml(rows, merges, 54);
}

export function buildNavlogXlsxBytes(input: NavlogExportInput) {
  validateCapacity(input);
  const type = input.navlogType ?? "VFR";
  const sheetXml = type === "IFR" ? buildIfrSheet(input) : buildVfrSheet(input);
  return writeZip(commonPackageEntries(sheetXml, type === "IFR" ? "NAVLOG" : "VFR NAVLOG"));
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