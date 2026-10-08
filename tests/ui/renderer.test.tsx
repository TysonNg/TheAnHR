import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from '../../src/renderer/src/App';
import type { Employee, Project, TheAnAPI } from '../../src/shared/types';

const project: Project = { id: 'p1', code: 'TA', name: 'Nhà máy kiểm thử', location: 'Bình Dương', notes: '', archived: false, employeeCount: 3 };
const employee = (id: string, fullName: string): Employee => ({ id, fullName, birthDate: '1990-03-02', identityNumber: '012345678901', issueDate: '2022-01-10', permanentAddress: 'Địa chỉ ban đầu', projectId: 'p1', projectName: project.name, portraitId: 'portrait', idFrontId: 'front', idBackId: 'back', notes: 'Ghi chú thủ công', archived: false, createdAt: '', updatedAt: '' });
let api: TheAnAPI;
let people: Employee[];
beforeEach(() => {
 people = [employee('e1', 'Nguyễn An'), employee('e2', 'Trần Bình'), employee('e3', 'Lê Chi')];
 api = {
  projects: { list: vi.fn(async () => [project]), save: vi.fn(async input => ({ ...project, ...input })), archive: vi.fn(async () => {}) },
  employees: { list: vi.fn(async filter => people.filter(e => !filter?.projectId || e.projectId === filter.projectId)), save: vi.fn(async input => ({ ...people[0], ...input })), archive: vi.fn(async () => {}), history: vi.fn(async () => [{id:'a1',employeeId:'e1',projectId:'p1',projectName:project.name,startDate:'2024-01-01',endDate:null}]), transfer: vi.fn(async () => {}) },
  assets: { get: vi.fn(async id => ({ id, kind: 'portrait', filename: 'ảnh.png', mime: 'image/png', url: 'data:image/png;base64,AA==' })), import: vi.fn(async (kind, data, filename) => ({id:'uploaded',kind,filename,mime:'image/png',url:'data:image/png;base64,AA=='})) },
  ocr: { recognize: vi.fn(async () => ({ fields: { fullName: 'Nguyễn Văn An', permanentAddress: 'HKTT được đọc', birthDate: '' }, text: 'Đọc hai mặt', warnings: ['Kiểm tra lại ngày cấp.'] })), onProgress: vi.fn(() => () => {}) },
  settings: { get: vi.fn(async () => ({ companyName:'Công ty kiểm thử',address:'',email:'',signingPlace:'Hồ Chí Minh',signingDepartment:'Nhân sự',signerName:'',logoId:null,signatureId:null })), save: vi.fn(async s => s) },
  exports: { preview: vi.fn(async () => ({token:'preview-token',pdfUrl:'data:application/pdf;base64,AA==',employeeCount:2,warnings:[]})), save: vi.fn(async () => ['saved.pdf']) },
  backup: { create: vi.fn(async () => 'backup.zip'), restore: vi.fn(async () => true) },
  app: { info: vi.fn(async () => ({version:'1.0.0',dataDirectory:'C:/Data'})), openDataDirectory: vi.fn(async () => {}) }
 };
 window.thean = api;
});
afterEach(cleanup);
const click = async (name: string | RegExp) => fireEvent.click(await screen.findByRole('button', {name}));
describe('offline renderer', () => {
 it('starts empty from the API and saves a project through the form', async () => {
  vi.mocked(api.projects.list).mockResolvedValue([]);
  render(<App />);
  expect(await screen.findByText('Chưa có dự án')).toBeInTheDocument();
  await click('Thêm dự án');
  fireEvent.change(screen.getByLabelText('Mã dự án'), {target:{value:'NM01'}});
  fireEvent.change(screen.getByLabelText('Tên dự án'), {target:{value:'Nhà máy mới'}});
  await click('Lưu dự án');
  await waitFor(() => expect(api.projects.save).toHaveBeenCalledWith(expect.objectContaining({code:'NM01',name:'Nhà máy mới'})));
 });
 it('fills HKTT immediately, keeps missing OCR fields, and saves manual edits without a confirmation checkbox', async () => {
  render(<App />); await click('Nhân viên'); await click('Mở hồ sơ Nguyễn An');
  await click('Đọc căn cước');
  await waitFor(() => expect(screen.getByLabelText('Hộ khẩu thường trú')).toHaveValue('HKTT được đọc'));
  expect(api.ocr.recognize).toHaveBeenCalledWith(['front','back']);
  expect(screen.getByLabelText('Ngày sinh')).toHaveValue('1990-03-02');
  expect(screen.queryByRole('checkbox', {name:/xác nhận.*(HKTT|hộ khẩu)/i})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Hộ khẩu thường trú'), {target:{value:'Địa chỉ sửa tay'}});
  fireEvent.change(screen.getByLabelText('Số căn cước'), {target:{value:'999888777666'}});
  await click('Lưu hồ sơ');
  await waitFor(() => expect(api.employees.save).toHaveBeenCalledWith(expect.objectContaining({permanentAddress:'Địa chỉ sửa tay',identityNumber:'999888777666',notes:'Ghi chú thủ công'})));
 });
 it('warns about unreadable OCR and leaves manual values intact', async () => {
  vi.mocked(api.ocr.recognize).mockResolvedValue({fields:{},text:'',warnings:[]});
  render(<App />); await click('Nhân viên'); await click('Mở hồ sơ Nguyễn An'); await click('Đọc căn cước');
  expect(await screen.findByText(/Không đọc được thông tin/)).toBeInTheDocument();
  expect(screen.getByLabelText('Hộ khẩu thường trú')).toHaveValue('Địa chỉ ban đầu');
 });
 it('exports only selected IDs in chosen order/date and invalidates preview on date changes', async () => {
  render(<App />); await click('Xuất lý lịch');
  fireEvent.change(await screen.findByLabelText('Dự án xuất'), {target:{value:'p1'}});
  fireEvent.click(await screen.findByLabelText('Chọn Nguyễn An'));
  fireEvent.click(screen.getByLabelText('Chọn Lê Chi'));
  await click('Đưa Lê Chi lên');
  fireEvent.change(screen.getByLabelText('Ngày ký'), {target:{value:'2026-10-09'}});
  await click('Xem trước PDF');
  await waitFor(() => expect(api.exports.preview).toHaveBeenCalledWith({projectId:'p1',employeeIds:['e3','e1'],signingDate:'2026-10-09'}));
  expect(await screen.findByTitle('Bản xem trước lý lịch')).toBeInTheDocument();
  await click('Lưu cả Word và PDF');
  expect(api.exports.save).toHaveBeenCalledWith('preview-token','both');
  fireEvent.change(screen.getByLabelText('Ngày ký'), {target:{value:'2026-10-10'}});
  expect(screen.queryByTitle('Bản xem trước lý lịch')).not.toBeInTheDocument();
 });
 it('selects only filtered employees and supports missing-field warning before preview', async () => {
  people[2].portraitId = null;
  render(<App />); await click('Xuất lý lịch');
  fireEvent.change(await screen.findByLabelText('Dự án xuất'), {target:{value:'p1'}});
  await screen.findByLabelText('Chọn Lê Chi');
  fireEvent.change(screen.getByLabelText('Tìm nhân viên để xuất'), {target:{value:'Lê'}});
  await click('Chọn tất cả kết quả'); await click('Xem trước PDF');
  expect(api.exports.preview).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog', {name:'Hồ sơ chưa đầy đủ'})).toHaveTextContent('ảnh chân dung');
  await click('Vẫn xem trước');
  await waitFor(() => expect(api.exports.preview).toHaveBeenCalledWith(expect.objectContaining({employeeIds:['e3']})));
 });
 it('transfers through a separate dated dialog and exposes assignment history', async () => {
  vi.mocked(api.projects.list).mockResolvedValue([project,{...project,id:'p2',name:'Văn phòng kiểm thử'}]);
  render(<App />); await click('Nhân viên'); await click('Mở hồ sơ Nguyễn An'); await click('Chuyển dự án');
  const dialog = await screen.findByRole('dialog',{name:'Chuyển dự án'});
  fireEvent.change(within(dialog).getByLabelText('Dự án mới'),{target:{value:'p2'}});
  fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'),{target:{value:'2026-10-08'}});
  await click('Xác nhận chuyển');
  await waitFor(() => expect(api.employees.transfer).toHaveBeenCalledWith('e1','p2','2026-10-08'));
  expect(await screen.findByText('2024-01-01')).toBeInTheDocument();
 });
 it('edits company settings and requires restore confirmation', async () => {
  render(<App />); await click('Cấu hình');
  fireEvent.change(await screen.findByLabelText('Tên công ty'),{target:{value:'Thế An mới'}});
  await click('Lưu cấu hình');
  await waitFor(() => expect(api.settings.save).toHaveBeenCalledWith(expect.objectContaining({companyName:'Thế An mới'})));
  await click('Khôi phục dữ liệu'); expect(api.backup.restore).not.toHaveBeenCalled();
  await click('Chọn bản sao lưu và khôi phục');
  await waitFor(() => expect(api.backup.restore).toHaveBeenCalledOnce());
 });
 it('closes a focused modal with Escape', async () => {
  render(<App />); await click('Thêm dự án');
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  fireEvent.keyDown(dialog,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('imports front and back independently from File array buffers without replacing portrait', async () => {
  render(<App />); await click('Nhân viên'); await click('Mở hồ sơ Nguyễn An');
  const front = new File([new Uint8Array([1,2,3])],'mat-truoc.png',{type:'image/png'});
  Object.defineProperty(front,'arrayBuffer',{value:async()=>new Uint8Array([1,2,3]).buffer});
  fireEvent.change(screen.getByLabelText('Tải Mặt trước căn cước'),{target:{files:[front]}});
  await waitFor(()=>expect(api.assets.import).toHaveBeenCalledWith('idFront',new Uint8Array([1,2,3]),'mat-truoc.png'));
  await click('Lưu hồ sơ');
  await waitFor(()=>expect(api.employees.save).toHaveBeenCalledWith(expect.objectContaining({portraitId:'portrait',idFrontId:'uploaded',idBackId:'back'})));
 });
 it('closing the nested image editor does not submit the employee form', async () => {
  render(<App />); await click('Nhân viên'); await click('Mở hồ sơ Nguyễn An');
  fireEvent.click(screen.getAllByRole('button',{name:'Cắt / xoay'})[0]);
  await click('Đóng Cắt và xoay ảnh');
  expect(api.employees.save).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog',{name:'Hồ sơ nhân viên'})).toBeInTheDocument();
 });
 it('offers archival confirmation and forwards archive action for the chosen employee', async () => {
  render(<App />); await click('Nhân viên');
  fireEvent.click((await screen.findAllByRole('button',{name:'Lưu trữ'}))[0]);
  expect(api.employees.archive).not.toHaveBeenCalled();
  await click('Xác nhận lưu trữ');
  await waitFor(()=>expect(api.employees.archive).toHaveBeenCalledWith('e1',true));
 });
 it('shows a friendly error and lets the user retry saving the intact form', async () => {
  vi.mocked(api.projects.save).mockRejectedValueOnce(new Error('Không thể ghi dữ liệu.'));
  render(<App />);await click('Thêm dự án');
  fireEvent.change(screen.getByLabelText('Mã dự án'),{target:{value:'P2'}});
  fireEvent.change(screen.getByLabelText('Tên dự án'),{target:{value:'Dự án thứ hai'}});
  await click('Lưu dự án');expect(await screen.findByRole('alert')).toHaveTextContent('Không thể ghi dữ liệu.');
  expect(screen.getByLabelText('Tên dự án')).toHaveValue('Dự án thứ hai');
  await click('Lưu dự án');await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 });
 it('rejects images over the backend 20 MB limit before reading or importing them', async () => {
  render(<App />);await click('Nhân viên');await click('Mở hồ sơ Nguyễn An');
  const image=new File([],'too-large.png',{type:'image/png'});Object.defineProperty(image,'size',{value:21*1024*1024});
  const read=vi.fn(async()=>new ArrayBuffer(1));Object.defineProperty(image,'arrayBuffer',{value:read});
  fireEvent.change(screen.getByLabelText('Tải Mặt trước căn cước'),{target:{files:[image]}});
  expect(await screen.findByText(/20 MB/)).toBeInTheDocument();
  expect(read).not.toHaveBeenCalled();expect(api.assets.import).not.toHaveBeenCalled();
 });
});
it('reads one available CCCD face without forcing a second photo', async()=>{
 people[0].idBackId=null;
 render(<App/>);await click('Nhân viên');await click('Mở hồ sơ Nguyễn An');await click('Đọc căn cước');
 await waitFor(()=>expect(api.ocr.recognize).toHaveBeenCalledWith(['front']));
 expect(screen.getByLabelText('Hộ khẩu thường trú')).toHaveValue('HKTT được đọc');
});
