import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Packer, PageOrientation,
  Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
  type IParagraphOptions, type IRunOptions,
} from 'docx';
import type { Employee, CompanySettings } from '../shared/types';
import { unzlibSync } from 'fflate';

export interface ExportSnapshot {
  employees: Employee[];
  settings: CompanySettings;
  signingDate: string;
  assets: Record<string, { data: Uint8Array; mime: string }>;
}

// Measurements are from the binary reference document, in twentieths of a point.
const PAGE = { width: 15840, height: 12240, left: 230, right: 634, top: 142, bottom: 29 };
const COLUMNS = [630, 2340, 2804, 1984, 2552, 1701, 2835];
const TABLE_WIDTH = COLUMNS.reduce((sum, width) => sum + width, 0);
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
const TITLE = 'LÝ LỊCH TRÍCH NGANG TỔ BẢO VỆ';
const HEADINGS = ['STT', 'Ảnh', 'Họ và tên', 'Ngày tháng năm sinh', 'CCCD', 'Ngày cấp', 'HKTT'];
const FONT = 'Times New Roman';
const ROW_HEIGHT = 2695;
const SIGNATURE_WIDTH = 8280;

type ReportImage = {
  data: Buffer;
  mime: string;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  width: number;
  height: number;
};
type Report = {
  settings: CompanySettings;
  signingLine: string;
  logo?: ReportImage;
  signature?: ReportImage;
  rows: { values: string[]; portrait?: ReportImage }[];
};

function calendarDate(value: string): { year: string; month: string; day: string } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return undefined;
  return { year, month, day };
}

function displayDate(value: string): string {
  if (!value) return '';
  const date = calendarDate(value);
  return date ? `${date.day}/${date.month}/${date.year}` : value;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function validatePng(data: Buffer): void {
  const compressed: Buffer[] = [];
  let offset = 8, ended = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 8 + length;
    if (end + 4 > data.length) throw new Error('Dữ liệu ảnh PNG bị thiếu.');
    const kind = data.toString('ascii', offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end; index++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[index]) & 0xff];
    if (((crc ^ 0xffffffff) >>> 0) !== data.readUInt32BE(end)) throw new Error('Dữ liệu ảnh PNG bị hỏng.');
    if (offset === 8 && (kind !== 'IHDR' || length !== 13)) throw new Error('Dữ liệu ảnh PNG không hợp lệ.');
    if (kind === 'IDAT') compressed.push(data.subarray(offset + 8, end));
    offset = end + 4;
    if (kind === 'IEND') { ended = length === 0 && offset === data.length; break; }
  }
  if (!ended || !compressed.length) throw new Error('Dữ liệu ảnh PNG bị thiếu.');
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  const depth = data[24], color = data[25], interlace = data[28];
  const channels = [1, 0, 3, 1, 2, 0, 4][color];
  const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
  if (!width || !height || !channels || !depths.includes(depth) || data[26] !== 0 || data[27] !== 0 || interlace > 1) {
    throw new Error('Dữ liệu ảnh PNG không hợp lệ.');
  }
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const expected = passes.reduce((size, [x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const rows = Math.max(0, Math.ceil((height - y) / dy));
    return size + (columns && rows ? (1 + Math.ceil(columns * channels * depth / 8)) * rows : 0);
  }, 0);
  try {
    if (unzlibSync(Buffer.concat(compressed)).length !== expected) throw new Error();
  } catch {
    throw new Error('Dữ liệu điểm ảnh PNG không hợp lệ.');
  }
}
/** Read raster dimensions locally, without Electron, Word, a filesystem or network access. */
function imageSize(data: Buffer, type: ReportImage['type']): [number, number] {
  if (type === 'png' && data.length >= 33 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.toString('ascii', 12, 16) === 'IHDR') {
    validatePng(data);
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (type === 'gif' && data.length >= 13 && /^GIF8[79]a$/.test(data.toString('ascii', 0, 6))) {
    return [data.readUInt16LE(6), data.readUInt16LE(8)];
  }
  if (type === 'bmp' && data.length >= 26 && data.toString('ascii', 0, 2) === 'BM') {
    if (data.readUInt32LE(14) === 12) return [data.readUInt16LE(18), data.readUInt16LE(20)];
    if (data.length >= 54 && data.readUInt32LE(14) >= 40) return [data.readInt32LE(18), Math.abs(data.readInt32LE(22))];
  }
  if (type === 'jpg' && data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    let dimensions: [number, number] | undefined;
    while (offset + 3 < data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) break;
      if (marker === 0xda) {
        // A frame header alone is not an image: require an image scan and end marker.
        const end = data.lastIndexOf(Buffer.from([0xff, 0xd9]));
        if (dimensions && length >= 6 && end > offset + length) return dimensions;
        break;
      }
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        dimensions = [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)];
      }
      offset += length;
    }
  }
  throw new Error('Dữ liệu ảnh không hợp lệ.');
}

function prepareReport(snapshot: ExportSnapshot): Report {
  const date = calendarDate(snapshot.signingDate);
  if (!date) throw new Error('Ngày ký phải là ngày hợp lệ theo định dạng YYYY-MM-DD.');
  if (!snapshot.employees.length) throw new Error('Cần chọn ít nhất một nhân viên để xuất báo cáo.');
  const imageCache = new Map<string, ReportImage>();
  const image = (id: string | null): ReportImage | undefined => {
    if (!id || !Object.hasOwn(snapshot.assets, id)) return undefined;
    const cached = imageCache.get(id);
    if (cached) return cached;
    const asset = snapshot.assets[id];
    const formats: Record<string, ReportImage['type']> = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp',
    };
    const type = Object.hasOwn(formats, asset.mime) ? formats[asset.mime] : undefined;
    if (!type) throw new Error('Định dạng ảnh không hỗ trợ; dùng PNG, JPEG, GIF hoặc BMP.');
    const data = Buffer.from(asset.data);
    const [width, height] = imageSize(data, type);
    if (!(width > 0 && height > 0)) throw new Error('Kích thước ảnh không hợp lệ.');
    const result = { data, mime: asset.mime, type, width, height };
    imageCache.set(id, result);
    return result;
  };
  const settings = { ...snapshot.settings };
  const printedText = [settings.companyName, settings.address, settings.email, settings.signingPlace,
    settings.signingDepartment, settings.signerName, ...snapshot.employees.flatMap(employee =>
      [employee.fullName, employee.birthDate, employee.identityNumber, employee.issueDate, employee.permanentAddress])];
  if (printedText.some(text => /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(text))) {
    throw new Error('Văn bản chứa ký tự không hợp lệ; hãy sửa trước khi xuất báo cáo.');
  }
  return {
    settings,
    signingLine: `${settings.signingPlace}${settings.signingPlace ? ' ' : ''}ngày ${date.day} tháng ${date.month} năm ${date.year}`,
    logo: image(settings.logoId),
    signature: image(settings.signatureId),
    rows: snapshot.employees.map((employee, index) => ({
      values: [String(index + 1), '', employee.fullName || '', displayDate(employee.birthDate),
        employee.identityNumber || '', displayDate(employee.issueDate), employee.permanentAddress || ''],
      portrait: image(employee.portraitId),
    })),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

// Fit, never crop or stretch: both formats use the same physical dimensions.
function fit(image: ReportImage, maxWidthPt: number, maxHeightPt: number): { width: number; height: number } {
  const scale = Math.min(maxWidthPt / image.width, maxHeightPt / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

function htmlImage(image: ReportImage | undefined, alt: string, widthPt: number, heightPt: number): string {
  if (!image) return '';
  const size = fit(image, widthPt, heightPt);
  return `<img alt="${escapeHtml(alt)}" src="data:${image.mime};base64,${image.data.toString('base64')}" width="${size.width * 4 / 3}" height="${size.height * 4 / 3}" style="width:${size.width}pt;height:${size.height}pt">`;
}

/** Standalone print document; the caller renders this snapshot with Electron printToPDF. */
export function buildReportHtml(snapshot: ExportSnapshot): string {
  const report = prepareReport(snapshot);
  const { settings } = report;
  const rows = report.rows.map(row => `<tr>${row.values.map((value, index) =>
    `<td>${index === 1 ? htmlImage(row.portrait, row.values[2], 106.2, 126) : escapeHtml(value)}</td>`).join('')}</tr>`).join('\n');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${TITLE}</title>
<style>
@page { size: 11in 8.5in; margin: 7.1pt 31.7pt 1.45pt 11.5pt; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: "Times New Roman", serif; font-size: 12pt; }
body { width: ${CONTENT_WIDTH / 20}pt; }
p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.15; }
.company { display: grid; grid-template-columns: 153.9pt minmax(0, 1fr); align-items: center; break-inside: avoid; page-break-inside: avoid; }
.logo { text-align: center; }
.company-text { padding: 0 5.4pt; text-align: center; }
.company-name { font-size: 14pt; font-weight: bold; }
h1 { font-family: Cambria, serif; margin: 10pt 0 8pt; text-align: center; font-size: 16pt; line-height: 1.15; font-weight: bold; break-after: avoid; page-break-after: avoid; }
table { border-collapse: collapse; table-layout: fixed; width: ${TABLE_WIDTH / 20}pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
tbody tr { height: ${ROW_HEIGHT / 20}pt; }
th, td { border: 0.5pt solid #000; padding: 0 5.4pt; vertical-align: middle; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.15; }
th { font-size: 10pt; font-weight: bold; }
td:last-child { text-align: left; }
img { vertical-align: middle; object-fit: contain; }
.signature { width: ${SIGNATURE_WIDTH / 20}pt; margin: 12pt 0 0 auto; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.signing-date { font-style: italic; }
.department, .signer { font-weight: bold; }
.signature-image { margin: 6pt 0; }
</style></head><body>
<header class="company"><div class="logo">${htmlImage(report.logo, settings.companyName, 24, 24)}</div><div class="company-text">
<p class="company-name">${escapeHtml(settings.companyName)}</p>
<p>${escapeHtml(settings.address ? `Địa chỉ:${settings.address}` : '')}</p>
<p>${escapeHtml(settings.email ? `Email ${settings.email}` : '')}</p>
</div></header>
<h1>${TITLE}</h1>
<table aria-label="${TITLE}"><colgroup>${COLUMNS.map(width => `<col style="width:${width / 20}pt">`).join('')}</colgroup>
<thead><tr>${HEADINGS.map(heading => `<th scope="col">${heading}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
<section class="signature"><p class="signing-date">${escapeHtml(report.signingLine)}</p>
<p class="department">${escapeHtml(settings.signingDepartment)}</p>
${report.signature ? `<p class="signature-image">${htmlImage(report.signature, settings.signerName, 126.6, 131.4)}</p>` : ''}
<p class="signer">${escapeHtml(settings.signerName)}</p></section>
</body></html>`;
}

function textParagraph(text: string, options: IParagraphOptions = {}, run: Omit<IRunOptions, 'text'> = {}): Paragraph {
  const children: TextRun[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (index) children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ text: line, font: FONT, size: 24, ...run }));
  });
  return new Paragraph({ spacing: { before: 0, after: 0, line: 276 }, ...options, children });
}

function docxImage(image: ReportImage, alt: string, widthPt: number, heightPt: number): ImageRun {
  const size = fit(image, widthPt, heightPt);
  return new ImageRun({
    type: image.type, data: image.data, transformation: { width: size.width * 4 / 3, height: size.height * 4 / 3 },
    altText: { name: alt, title: alt, description: alt },
  });
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };

/** Native editable OOXML table, with embedded raster media; Word is never required. */
export async function buildReportDocx(snapshot: ExportSnapshot): Promise<Buffer> {
  const report = prepareReport(snapshot);
  const { settings } = report;
  const header = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [3078, CONTENT_WIDTH - 3078],
    layout: TableLayoutType.FIXED, borders: noBorders, margins: { top: 0, bottom: 0, left: 108, right: 108 },
    rows: [new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: 3078, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        children: [report.logo ? new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 0, after: 0 },
          children: [docxImage(report.logo, settings.companyName, 24, 24)] }) : textParagraph('', { keepNext: true })] }),
      new TableCell({ width: { size: CONTENT_WIDTH - 3078, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
        textParagraph(settings.companyName, { alignment: AlignmentType.CENTER, keepNext: true, keepLines: true }, { size: 28, bold: true }),
        textParagraph(settings.address ? `Địa chỉ:${settings.address}` : '', { alignment: AlignmentType.CENTER, keepNext: true, keepLines: true }),
        textParagraph(settings.email ? `Email ${settings.email}` : '', { alignment: AlignmentType.CENTER, keepNext: true, keepLines: true }),
      ] }),
    ] })],
  });
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const cell = (text: string, index: number, heading: boolean, portrait?: ReportImage): TableCell => new TableCell({
    width: { size: COLUMNS[index], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    children: index === 1 && portrait ? [new Paragraph({ alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 }, children: [docxImage(portrait, text, 106.2, 126)] })] : [textParagraph(text, {
      alignment: !heading && index === 6 ? AlignmentType.LEFT : AlignmentType.CENTER,

    }, { bold: heading, size: heading ? 20 : 24 })],
  });
  const table = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA }, columnWidths: COLUMNS, layout: TableLayoutType.FIXED,
    margins: { top: 0, bottom: 0, left: 108, right: 108 },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: HEADINGS.map((heading, index) => cell(heading, index, true)) }),
      ...report.rows.map(row => new TableRow({ cantSplit: true, height: { value: ROW_HEIGHT, rule: HeightRule.ATLEAST },
        children: row.values.map((value, index) => cell(index === 1 && row.portrait ? row.values[2] : value, index, false, index === 1 ? row.portrait : undefined)) })),
    ],
  });
  const signingOptions: IParagraphOptions = {
    alignment: AlignmentType.CENTER, indent: { left: CONTENT_WIDTH - SIGNATURE_WIDTH }, keepLines: true, keepNext: true,
  };
  const signature = [
    textParagraph(report.signingLine, { ...signingOptions, spacing: { before: 240, after: 0, line: 276 } }, { italics: true }),
    textParagraph(settings.signingDepartment, signingOptions, { bold: true }),
    ...(report.signature ? [new Paragraph({ ...signingOptions, spacing: { before: 120, after: 120 },
      children: [docxImage(report.signature, settings.signerName, 126.6, 131.4)] })] : []),
    textParagraph(settings.signerName, { ...signingOptions, keepNext: false }, { bold: true }),
  ];
  const document = new Document({
    styles: { default: { document: { run: { font: FONT, size: 24, language: { value: 'vi-VN' } },
      paragraph: { spacing: { before: 0, after: 0, line: 276 } } } } },
    sections: [{
      properties: { page: {
        // docx swaps these dimensions when writing landscape OOXML.
        size: { width: PAGE.height, height: PAGE.width, orientation: PageOrientation.LANDSCAPE },
        margin: { left: PAGE.left, right: PAGE.right, top: PAGE.top, bottom: PAGE.bottom, header: 0, footer: 0, gutter: 0 },
      } },
      children: [header, textParagraph(TITLE, { style: 'Title', alignment: AlignmentType.CENTER, keepNext: true, keepLines: true,
        spacing: { before: 200, after: 160, line: 368 } }, { bold: true, size: 32, font: 'Cambria' }), table, ...signature],
    }],
  });
  return Packer.toBuffer(document);
}

/** Warnings describe the selection, so callers can show them before committing the export. */
export function reportWarnings(employees: Employee[]): string[] {
  const fields: [keyof Employee, string][] = [
    ['fullName', 'họ và tên'], ['portraitId', 'ảnh chân dung'], ['birthDate', 'ngày tháng năm sinh'],
    ['identityNumber', 'CCCD'], ['issueDate', 'ngày cấp'], ['permanentAddress', 'HKTT (địa chỉ thường trú)'],
  ];
  const warnings: string[] = [];
  const label = (employee: Employee, index: number) => employee.fullName?.trim() || `STT ${index + 1}`;
  for (const [field, title] of fields) {
    const missing = employees.flatMap((employee, index) =>
      typeof employee[field] !== 'string' || !String(employee[field]).trim() ? [label(employee, index)] : []);
    if (missing.length) warnings.push(`${missing.length} nhân viên thiếu ${title}: ${missing.join(', ')}.`);
  }
  for (const [field, title] of [['birthDate', 'ngày sinh'], ['issueDate', 'ngày cấp']] as const) {
    const invalid = employees.flatMap((employee, index) => employee[field] && !calendarDate(employee[field]) ? [label(employee, index)] : []);
    if (invalid.length) warnings.push(`${invalid.length} nhân viên có ${title} không hợp lệ: ${invalid.join(', ')}.`);
  }
  return warnings;
}