import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { unzipSync, strFromU8, zlibSync } from 'fflate';
import type { Employee, CompanySettings } from '../src/shared/types';
import { buildReportHtml, buildReportDocx, reportWarnings, type ExportSnapshot } from '../src/main/exporter';

// Generated flat pixels, never employee photographs or images from the reference.
function pixel(red: number, green: number, blue: number, width = 1, height = 1): Uint8Array {
  const chunk = (type: string, bytes: Uint8Array) => {
    const payload = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  };
  const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  const scanline = [0, ...Array.from({ length: width }, () => [red, green, blue]).flat()];
  const pixels = Uint8Array.from(Array.from({ length: height }, () => scanline).flat());
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlibSync(pixels)), chunk('IEND', new Uint8Array())]);
}
const settings: CompanySettings = {
  companyName: 'CÔNG TY TNHH DV BẢO VỆ THẾ AN',
  address: '436/59/40 Cách Mạng Tháng Tám.Phường Nhiêu Lộc.TP.HCM', email: 'baovethean@gmail.com',
  signingPlace: 'Thành phố Hồ Chí Minh', signingDepartment: 'Phòng nghiệp vụ', signerName: 'Nguyễn Hữu Ngọc',
  logoId: null, signatureId: null,
};
const employee = (id: string, overrides: Partial<Employee> = {}): Employee => ({
  id, fullName: `Nhân viên thử ${id}`, birthDate: '1992-02-29', identityNumber: '000000000123',
  issueDate: '2024-08-01', permanentAddress: 'Địa chỉ thử nghiệm', projectId: 'fixture',
  projectName: 'PROJECT MUST NEVER APPEAR', portraitId: null, idFrontId: null, idBackId: null,
  notes: 'NOTES MUST NEVER APPEAR', archived: false, createdAt: '', updatedAt: '', ...overrides,
});
const snapshot = (overrides: Partial<ExportSnapshot> = {}): ExportSnapshot => ({
  employees: [employee('B'), employee('A')], settings: { ...settings }, signingDate: '2026-08-25', assets: {}, ...overrides,
});
const htmlDocument = (input: ExportSnapshot) => new JSDOM(buildReportHtml(input)).window.document;
const xmlDocument = (xml: string) => new JSDOM(xml, { contentType: 'text/xml' }).window.document;
const word = (root: Document | Element, local: string) => Array.from(root.getElementsByTagNameNS(
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main', local));
const attr = (node: Element, name: string) => node.getAttributeNS(
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main', name);
const cellTexts = (row: Element) => word(row, 'tc').map(cell => word(cell, 't').map(t => t.textContent).join(''));
async function unpack(input: ExportSnapshot) {
  const bytes = await buildReportDocx(input);
  expect(Buffer.isBuffer(bytes)).toBe(true);
  const files = unzipSync(bytes);
  const document = xmlDocument(strFromU8(files['word/document.xml']));
  const table = word(document, 'tbl').find(t => cellTexts(word(t, 'tr')[0])[0] === 'STT');
  expect(table).toBeDefined();
  return { files, document, table: table! };
}

describe('report exporter', () => {
  it('exports exactly the selected employees in supplied order with fresh STT and no project or notes', async () => {
    const input = snapshot();
    const html = htmlDocument(input);
    const rows = Array.from(html.querySelectorAll('tbody tr'));
    expect(rows.map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent))).toEqual([
      ['1', '', 'Nhân viên thử B', '29/02/1992', '000000000123', '01/08/2024', 'Địa chỉ thử nghiệm'],
      ['2', '', 'Nhân viên thử A', '29/02/1992', '000000000123', '01/08/2024', 'Địa chỉ thử nghiệm'],
    ]);
    expect(html.querySelector('h1')?.textContent).toBe('LÝ LỊCH TRÍCH NGANG TỔ BẢO VỆ');
    const { document, table } = await unpack(input);
    expect(word(table, 'tr').slice(1).map(cellTexts)).toEqual(rows.map(row =>
      Array.from(row.querySelectorAll('td')).map(cell => cell.textContent)));
    for (const text of [html.body.textContent!, document.documentElement.textContent!]) {
      expect(text).not.toContain('PROJECT MUST NEVER APPEAR');
      expect(text).not.toContain('NOTES MUST NEVER APPEAR');
      expect(text).not.toMatch(/Generated|Implementation|Tạo bởi|Xuất bởi/i);
    }
  });

  it('uses and safely escapes all configured company and signing text in both formats', async () => {
    const custom = { ...settings, companyName: '<script>alert("x")</script> & Công ty',
      address: '<img src=x onerror=alert(1)>', email: 'a&b@example.test',
      signingPlace: 'Địa điểm <>&"', signingDepartment: 'Bộ phận <ký>', signerName: 'Người ký & thử' };
    const input = snapshot({ settings: custom, signingDate: '2024-02-29',
      employees: [employee('x', { fullName: '<svg onload=alert(1)>', permanentAddress: 'A & B < C' })] });
    const html = htmlDocument(input);
    expect(html.querySelectorAll('script, img, svg')).toHaveLength(0);
    const { document } = await unpack(input);
    for (const text of [html.body.textContent!, document.documentElement.textContent!]) {
      for (const value of Object.values(custom).filter((v): v is string => typeof v === 'string')) expect(text).toContain(value);
      expect(text).toContain('Địa điểm <>&" ngày 29 tháng 02 năm 2024');
      expect(text).toContain('<svg onload=alert(1)>');
      expect(text).toContain('A & B < C');
    }
    expect(html.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("default-src 'none'");
  });

  it('keeps missing optional employee data as genuinely empty cells', async () => {
    const input = snapshot({ employees: [employee('empty', { fullName: '', birthDate: '', identityNumber: '', issueDate: '', permanentAddress: '' })] });
    const html = htmlDocument(input);
    expect(Array.from(html.querySelectorAll('tbody td')).map(c => c.textContent)).toEqual(['1', '', '', '', '', '', '']);
    const { table } = await unpack(input);
    expect(cellTexts(word(table, 'tr')[1])).toEqual(['1', '', '', '', '', '', '']);
    expect(html.querySelectorAll('img')).toHaveLength(0);
  });

  it('emits exact Letter landscape geometry and reference column widths in OOXML and print CSS', async () => {
    const input = snapshot();
    const html = htmlDocument(input);
    const css = html.querySelector('style')!.textContent!;
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*11in 8\.5in/);
    expect(css).toMatch(/margin:\s*7\.1pt 31\.7pt 1\.45pt 11\.5pt/);
    expect(css).toContain('Times New Roman');
    const { document, table, files } = await unpack(input);
    const size = word(document, 'pgSz')[0], margins = word(document, 'pgMar')[0];
    expect([attr(size, 'w'), attr(size, 'h'), attr(size, 'orient')]).toEqual(['15840', '12240', 'landscape']);
    expect(['left', 'right', 'top', 'bottom'].map(a => attr(margins, a))).toEqual(['230', '634', '142', '29']);
    expect(word(table, 'gridCol').map(c => attr(c, 'w'))).toEqual(['630', '2340', '2804', '1984', '2552', '1701', '2835']);
    expect(strFromU8(files['word/styles.xml'])).toContain('Times New Roman');
  });

  it('repeats the heading and keeps each growing row intact without fixed height or noWrap', async () => {
    const longName = 'Tên thử rất dài '.repeat(22).trim();
    const longAddress = 'Địa chỉ nhiều dòng và ký tự tiếng Việt '.repeat(40).trim();
    const input = snapshot({ employees: Array.from({ length: 55 }, (_, i) => employee(String(i), {
      fullName: i === 17 ? longName : `Người thử ${i}`, permanentAddress: i === 17 ? longAddress : `Số ${i}`,
    })) });
    const html = htmlDocument(input);
    expect(html.querySelectorAll('tbody tr')).toHaveLength(55);
    expect(html.querySelectorAll('tbody tr')[17].textContent).toContain(longName);
    expect(html.querySelectorAll('tbody tr')[17].textContent).toContain(longAddress);
    const css = html.querySelector('style')!.textContent!;
    expect(css).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/);
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).not.toMatch(/overflow:\s*hidden|text-overflow:\s*ellipsis/);
    const { table } = await unpack(input);
    const rows = word(table, 'tr');
    expect(rows).toHaveLength(56);
    expect(word(rows[0], 'tblHeader')).toHaveLength(1);
    expect(rows.every(row => word(row, 'cantSplit').length === 1)).toBe(true);
    expect(word(table, 'noWrap')).toHaveLength(0);
    expect(word(table, 'trHeight').every(h => attr(h, 'hRule') !== 'exact')).toBe(true);
    expect(cellTexts(rows[18])[2]).toBe(longName);
    expect(cellTexts(rows[18])[6]).toBe(longAddress);
    expect(cellTexts(rows[55])[0]).toBe('55');
  });

  it('embeds portrait, logo and signature bytes locally and keeps signature paragraphs together at the end', async () => {
    const portrait = pixel(220, 40, 10), logo = pixel(30, 180, 60), signature = pixel(20, 70, 230);
    const input = snapshot({ employees: [employee('P', { portraitId: 'portrait' })],
      settings: { ...settings, logoId: 'logo', signatureId: 'sign' },
      assets: { portrait: { data: portrait, mime: 'image/png' }, logo: { data: logo, mime: 'image/png' }, sign: { data: signature, mime: 'image/png' } } });
    const html = htmlDocument(input);
    const images = Array.from(html.querySelectorAll('img'));
    expect(images).toHaveLength(3);
    expect(new Set(images.map(img => img.getAttribute('src')))).toEqual(new Set([portrait, logo, signature].map(bytes =>
      'data:image/png;base64,' + Buffer.from(bytes).toString('base64'))));
    const block = html.querySelector('.signature')!;
    expect(block).not.toBeNull();
    expect(block.textContent).toContain('Thành phố Hồ Chí Minh ngày 25 tháng 08 năm 2026');
    expect(block.textContent).toContain('Phòng nghiệp vụ');
    expect(block.textContent).toContain('Nguyễn Hữu Ngọc');
    expect(block.querySelectorAll('img')).toHaveLength(1);
    const { files, document, table } = await unpack(input);
    const media = Object.entries(files).filter(([path]) => path.startsWith('word/media/')).map(([, data]) => Buffer.from(data));
    for (const bytes of [portrait, logo, signature]) expect(media.some(data => data.equals(Buffer.from(bytes)))).toBe(true);
    expect(word(word(table, 'tr')[1], 'drawing')).toHaveLength(1);
    const rels = xmlDocument(strFromU8(files['word/_rels/document.xml.rels']));
    const imageRels = Array.from(rels.getElementsByTagName('Relationship')).filter(r => r.getAttribute('Type')?.endsWith('/image'));
    expect(imageRels).toHaveLength(3);
    expect(imageRels.every(r => r.getAttribute('TargetMode') !== 'External')).toBe(true);
    const paragraphs = word(document, 'p');
    const signingIndex = paragraphs.findIndex(p => p.textContent?.includes('ngày 25 tháng 08 năm 2026'));
    expect(signingIndex).toBeGreaterThan(paragraphs.indexOf(word(table, 'p').at(-1)!));
    const signing = paragraphs.slice(signingIndex).filter(p => p.textContent || word(p, 'drawing').length);
    expect(signing.at(-1)?.textContent).toBe('Nguyễn Hữu Ngọc');
    expect(signing.slice(0, -1).every(p => word(p, 'keepNext').length === 1)).toBe(true);
    expect(signing.every(p => word(p, 'keepLines').length === 1)).toBe(true);
  });

  it('does not invent placeholders or external images for unavailable assets', async () => {
    const input = snapshot({ employees: [employee('x', { portraitId: 'missing' })],
      settings: { ...settings, logoId: 'missing-logo', signatureId: 'missing-sign' } });
    const html = htmlDocument(input);
    expect(html.querySelectorAll('img')).toHaveLength(0);
    const { files, document } = await unpack(input);
    expect(Object.keys(files).filter(p => p.startsWith('word/media/'))).toHaveLength(0);
    expect(word(document, 'drawing')).toHaveLength(0);
  });

  it('does not permit image MIME injection or image types that cannot be embedded consistently', async () => {
    const input = snapshot({ employees: [employee('x', { portraitId: 'unsafe' })],
      assets: { unsafe: { data: Buffer.from('<svg onload="alert(1)"/>'), mime: 'image/svg+xml' } } });
    expect(() => buildReportHtml(input)).toThrow(/ảnh|image/i);
    await expect(buildReportDocx(input)).rejects.toThrow(/ảnh|image/i);
  });

  it.each(['2026-02-30', '2023-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-08-00',
    '2026-8-25', '2026-08-25T00:00:00Z', ' 2026-08-25', '0000-01-01', ''])('rejects invalid ISO signing date %j in both formats', async signingDate => {
    const input = snapshot({ signingDate });
    expect(() => buildReportHtml(input)).toThrow(/ngày|date/i);
    await expect(buildReportDocx(input)).rejects.toThrow(/ngày|date/i);
  });

  it.each(['2000-02-29', '2024-02-29', '2026-12-31'])('accepts actual calendar signing date %s', async signingDate => {
    const input = snapshot({ signingDate });
    expect(() => buildReportHtml(input)).not.toThrow();
    await expect(buildReportDocx(input)).resolves.toBeInstanceOf(Buffer);
  });

  it('rejects an empty selection instead of generating blank reports', async () => {
    const input = snapshot({ employees: [] });
    expect(() => buildReportHtml(input)).toThrow(/nhân viên|employee/i);
    await expect(buildReportDocx(input)).rejects.toThrow(/nhân viên|employee/i);
  });

  it('keeps normal word boundaries instead of forcing Latin text to break character by character', async () => {
    const { table } = await unpack(snapshot());
    expect(word(table, 'wordWrap').some(node => attr(node, 'val') === '0')).toBe(false);
    expect(word(table, 'trHeight').map(node => [attr(node, 'val'), attr(node, 'hRule')])).toEqual([
      ['2695', 'atLeast'], ['2695', 'atLeast'],
    ]);
  });

  it.each(['\u0000', '\u000b', '\u001f', '\ud800', '\ufffe'])('rejects XML-invalid text %j consistently before building either format', async invalid => {
    for (const input of [snapshot({ employees: [employee('bad', { fullName: 'Tên' + invalid })] }),
      snapshot({ settings: { ...settings, signingDepartment: 'Bộ phận' + invalid } })]) {
      expect(() => buildReportHtml(input)).toThrow(/ký tự|character/i);
      await expect(buildReportDocx(input)).rejects.toThrow(/ký tự|character/i);
    }
  });

  it('rejects truncated or corrupt referenced PNG instead of embedding an unreadable image', async () => {
    const valid = pixel(12, 34, 56);
    const corrupt = Buffer.from(valid); corrupt[corrupt.length - 1] ^= 1;
    for (const data of [valid.subarray(0, 33), corrupt]) {
      const input = snapshot({ employees: [employee('bad', { portraitId: 'bad' })], assets: { bad: { data, mime: 'image/png' } } });
      expect(() => buildReportHtml(input)).toThrow(/ảnh|image/i);
      await expect(buildReportDocx(input)).rejects.toThrow(/ảnh|image/i);
    }
  });

  // A generated 2x1 flat-color JPEG, not a portrait or any reference asset.
  const jpeg = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJABsA//2Q==', 'base64');
  it.each([{ mime: 'image/png', data: pixel(20, 40, 60, 2, 1) }, { mime: 'image/jpeg', data: jpeg }])(
    'preserves non-square $mime image bytes and physical aspect ratio in HTML and DOCX', async asset => {
      const input = snapshot({ employees: [employee('wide', { portraitId: 'wide' })], assets: { wide: asset } });
      const html = htmlDocument(input);
      const photo = html.querySelector('tbody img') as HTMLImageElement;
      expect(photo.style.width).toBe('106.2pt'); expect(photo.style.height).toBe('53.1pt');
      const { document, files } = await unpack(input);
      const extent = document.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
      expect([extent.getAttribute('cx'), extent.getAttribute('cy')]).toEqual(['1348740', '674370']);
      const media = Object.entries(files).filter(([name]) => name.startsWith('word/media/')).map(([, bytes]) => Buffer.from(bytes));
      expect(media.some(bytes => bytes.equals(Buffer.from(asset.data)))).toBe(true);
    });

  it('rejects a JPEG whose compressed image scan is truncated', async () => {
    const input = snapshot({ employees: [employee('broken', { portraitId: 'broken' })],
      assets: { broken: { mime: 'image/jpeg', data: jpeg.subarray(0, jpeg.length - 8) } } });
    expect(() => buildReportHtml(input)).toThrow(/ảnh|image/i);
    await expect(buildReportDocx(input)).rejects.toThrow(/ảnh|image/i);
  });
  it('preserves multiline and invalid employee date text and warns with field/count/name', async () => {
    const input = snapshot({ employees: [employee('dates', { birthDate: '2023-02-29', issueDate: 'chưa xác định',
      permanentAddress: 'Dòng một\nDòng hai & <ba>' })] });
    const html = htmlDocument(input);
    const { table } = await unpack(input);
    expect(html.querySelectorAll('tbody td')[3].textContent).toBe('2023-02-29');
    expect(html.querySelectorAll('tbody td')[5].textContent).toBe('chưa xác định');
    expect(cellTexts(word(table, 'tr')[1]).slice(3, 6)).toEqual(['2023-02-29', '000000000123', 'chưa xác định']);
    expect(word(word(table, 'tr')[1], 'br')).toHaveLength(1);
    const warnings = reportWarnings(input.employees);
    expect(warnings.some(w => /1/.test(w) && /ngày sinh/.test(w) && w.includes('Nhân viên thử dates'))).toBe(true);
    expect(warnings.some(w => /1/.test(w) && /ngày cấp/.test(w) && w.includes('Nhân viên thử dates'))).toBe(true);
  });
  it('reports actionable missing-field counts and employee names, including unnamed selections', () => {
    const warnings = reportWarnings([employee('B', { portraitId: 'present', permanentAddress: '', issueDate: '' }),
      employee('A', { portraitId: 'present', permanentAddress: '' }),
      employee('C', { fullName: '', portraitId: 'present', identityNumber: '' })]);
    expect(warnings.some(w => /2/.test(w) && /HKTT|địa chỉ/i.test(w) && w.includes('Nhân viên thử B') && w.includes('Nhân viên thử A'))).toBe(true);
    expect(warnings.some(w => /1/.test(w) && /ngày cấp/i.test(w) && w.includes('Nhân viên thử B'))).toBe(true);
    expect(warnings.some(w => /CCCD/i.test(w) && /STT\s*3/i.test(w))).toBe(true);
    expect(reportWarnings([employee('complete', { portraitId: 'present' })])).toEqual([]);
    expect(reportWarnings([])).toEqual([]);
  });

  it('renders multi-page report with repeated table headers and intact images across multiple pages', async () => {
    const portraitData = pixel(45, 67, 89, 100, 120);
    const manyEmployees = Array.from({ length: 15 }, (_, i) =>
      employee(`emp-${i + 1}`, {
        fullName: `Nhân viên nhiều trang ${i + 1}`,
        portraitId: `portrait-${i + 1}`,
      })
    );
    const assets = Object.fromEntries(
      manyEmployees.map(e => [e.portraitId!, { data: portraitData, mime: 'image/png' }])
    );
    const input = snapshot({ employees: manyEmployees, assets });
    const html = buildReportHtml(input);
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('tr { break-inside: avoid; page-break-inside: avoid; }');
    const doc = new JSDOM(html).window.document;
    const images = doc.querySelectorAll('tbody img');
    expect(images).toHaveLength(15);
    for (const img of images) {
      expect((img as HTMLImageElement).getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    }

    const { table } = await unpack(input);
    const rows = word(table, 'tr');
    expect(rows).toHaveLength(16); // 1 header + 15 data rows
    expect(word(rows[0], 'tblHeader')).toHaveLength(1);
    for (let i = 1; i <= 15; i++) {
      expect(word(rows[i], 'cantSplit')).toHaveLength(1);
    }
  });
});