import type { Leg, WaypointMeta } from "@/lib/vfr/nav";

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

type NavlogExportInput = {
  waypoints: WaypointMeta[];
  legs: Leg[];
  totalDistance: number;
  totalTime: number;
  totalFuel: number;
  fuelUnit: "L" | "USG";
  fuelUnitLabel: string;
};

const TEMPLATE_URL = "/VFR_NAVLOG.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const L_TO_US_GAL = 0.2641720524;
const FIXED_FUEL_USG = {
  reserve: 6,
  extra: 4,
  taxi: 1,
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([toArrayBuffer(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid XLSX template.");

  const entries: ZipEntry[] = [];
  const count = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  for (let i = 0; i < count; i++) {
    if (u32(view, offset) !== 0x02014b50) throw new Error("Invalid XLSX central directory.");
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const fileNameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, fileNameLength));

    if (u32(view, localOffset) !== 0x04034b50) throw new Error("Invalid XLSX local header.");
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = new Uint8Array(buffer, dataStart, compressedSize);
    const data =
      method === 0 ? new Uint8Array(compressed) : method === 8 ? await inflateRaw(compressed) : null;
    if (!data) throw new Error(`Unsupported XLSX compression method: ${method}`);
    entries.push({ name, data });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
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

function setCell(doc: XMLDocument, ref: string, value: string | number | null) {
  const cell = doc.querySelector(`c[r="${ref}"]`);
  if (!cell) return;
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  if (value === null || value === "") {
    cell.removeAttribute("t");
    return;
  }
  if (typeof value === "number") {
    cell.removeAttribute("t");
    const v = doc.createElementNS(cell.namespaceURI, "v");
    v.textContent = Number(value.toFixed(3)).toString();
    cell.appendChild(v);
    return;
  }
  cell.setAttribute("t", "inlineStr");
  const is = doc.createElementNS(cell.namespaceURI, "is");
  const t = doc.createElementNS(cell.namespaceURI, "t");
  t.textContent = value;
  is.appendChild(t);
  cell.appendChild(is);
}

function minutesToText(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return "";
  return `${Math.round(hours * 60)} min`;
}

function usGallonsToExportUnit(value: number, fuelUnit: NavlogExportInput["fuelUnit"]) {
  return fuelUnit === "USG" ? value : value / L_TO_US_GAL;
}

function fuelText(value: number, unitLabel: string) {
  return `${value.toFixed(1)} ${unitLabel}`;
}

function patchSheetXml(sheetXml: string, input: NavlogExportInput) {
  const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
  const waypointRows = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
  const legRows = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
  const contingencyFuel = input.totalFuel * 0.05;
  const reserveFuel = usGallonsToExportUnit(FIXED_FUEL_USG.reserve, input.fuelUnit);
  const extraFuel = usGallonsToExportUnit(FIXED_FUEL_USG.extra, input.fuelUnit);
  const taxiFuel = usGallonsToExportUnit(FIXED_FUEL_USG.taxi, input.fuelUnit);
  const blockFuel = input.totalFuel + contingencyFuel + reserveFuel + extraFuel + taxiFuel;

  for (const row of waypointRows) setCell(doc, `A${row}`, "");
  for (const row of legRows) {
    for (const col of ["F", "G", "I", "K"]) setCell(doc, `${col}${row}`, "");
  }

  input.waypoints.slice(0, waypointRows.length).forEach((waypoint, index) => {
    setCell(doc, `A${waypointRows[index]}`, waypoint.label);
  });
  input.legs.slice(0, legRows.length).forEach((leg, index) => {
    const row = legRows[index]!;
    setCell(doc, `F${row}`, minutesToText(leg.ete));
    setCell(doc, `G${row}`, Math.round(leg.distance));
    setCell(doc, `I${row}`, Math.round(leg.magneticCourse));
    setCell(doc, `K${row}`, Math.round(leg.trueCourse));
  });

  setCell(doc, "F26", minutesToText(input.totalTime));
  setCell(doc, "G26", Math.round(input.totalDistance));
  setCell(doc, "J29", fuelText(input.totalFuel, input.fuelUnitLabel));
  setCell(doc, "J30", fuelText(contingencyFuel, input.fuelUnitLabel));
  setCell(doc, "J32", fuelText(reserveFuel, input.fuelUnitLabel));
  setCell(doc, "J33", fuelText(extraFuel, input.fuelUnitLabel));
  setCell(doc, "J34", fuelText(taxiFuel, input.fuelUnitLabel));
  setCell(doc, "J35", fuelText(blockFuel, input.fuelUnitLabel));

  return new XMLSerializer().serializeToString(doc);
}

export async function exportNavlogXlsx(input: NavlogExportInput) {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Navigation log template could not be loaded.");
  const entries = await readZip(await response.arrayBuffer());
  const patched = entries.map((entry) =>
    entry.name === "xl/worksheets/sheet1.xml"
      ? { ...entry, data: encoder.encode(patchSheetXml(decoder.decode(entry.data), input)) }
      : entry,
  );
  const xlsx = writeZip(patched);
  const blob = new Blob([toArrayBuffer(xlsx)], {
    type: XLSX_MIME,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `VFR_NAVLOG_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
