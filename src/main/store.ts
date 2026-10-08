import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { z } from 'zod';
import type { Asset, AssetKind, Assignment, CompanySettings, Employee, EmployeeFilter, EmployeeInput, Project, ProjectInput } from '../shared/types';
import { localDate, requireDate, validDate } from '../shared/dates';

const text=z.string().max(5000);
const assetId=z.string().uuid().nullable();
const optionalDate=z.string().refine(v=>v===''||validDate(v),'Ngày không hợp lệ.');
const projectSchema=z.object({id:z.string().uuid().optional(),code:text.trim().min(1,'Nhập mã dự án.'),name:text.trim().min(1,'Nhập tên dự án.'),location:text,notes:text,archived:z.boolean().optional()});
const employeeSchema=z.object({
 id:z.string().uuid().optional(), fullName:text.trim().min(1,'Nhập họ tên.'), projectId:z.string().uuid(),
 birthDate:optionalDate, identityNumber:z.string().transform(v=>v.replace(/\s/g,'')).refine(v=>v===''||/^\d{9}$|^\d{12}$/.test(v),'Số CCCD/CMND phải gồm 9 hoặc 12 chữ số.'),
 issueDate:optionalDate, permanentAddress:text, notes:text, portraitId:assetId, idFrontId:assetId, idBackId:assetId, archived:z.boolean().optional()
});
const settingsSchema=z.object({companyName:text.trim().min(1,'Nhập tên công ty.'),address:text,email:text,signingPlace:text.trim().min(1,'Nhập địa điểm ký.'),signingDepartment:text,signerName:text,logoId:assetId,signatureId:assetId});
export const defaultSettings:CompanySettings={
 companyName:'CÔNG TY TNHH DV BẢO VỆ THẾ AN',
 address:'436/59/40 Cách Mạng Tháng Tám.Phường Nhiêu Lộc.TP.HCM',
 email:'baovethean@gmail.com',signingPlace:'Thành phố Hồ Chí Minh',signingDepartment:'Phòng nghiệp vụ',
 signerName:'Nguyễn Hữu Ngọc',logoId:null,signatureId:null
};
export interface StoredAsset { id:string;kind:AssetKind;filename:string;mime:string;diskFilename:string; }
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const selectEmployees=`SELECT e.*,a.projectId,p.name AS projectName FROM employees e
 JOIN assignments a ON a.employeeId=e.id AND a.endDate IS NULL JOIN projects p ON p.id=a.projectId`;
function translateDbError(error:unknown):never {
 const message=error instanceof Error?error.message:String(error);
 if(message.includes('employees.identityNumber')) throw new Error('Số CCCD/CMND đã tồn tại trong hồ sơ khác.');
 if(message.includes('projects.code')) throw new Error('Mã dự án đã tồn tại.');
 throw error;
}
export class HRStore {
 readonly databasePath:string;
 readonly db:DatabaseSync;
 private closed=false;
 constructor(public readonly dataDirectory:string) {
  mkdirSync(join(dataDirectory,'assets'),{recursive:true});
  this.databasePath=join(dataDirectory,'hr.sqlite');
  this.db=new DatabaseSync(this.databasePath);
  this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const version=Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
  if(version>1){this.close();throw new Error('Dữ liệu thuộc phiên bản mới hơn. Hãy nâng cấp ứng dụng.');}
  if(version===0) this.db.exec(`
   BEGIN;
   CREATE TABLE projects(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,location TEXT NOT NULL,notes TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)));
   CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('portrait','idFront','idBack','logo','signature')),filename TEXT NOT NULL,mime TEXT NOT NULL,diskFilename TEXT NOT NULL UNIQUE);
   CREATE TABLE employees(id TEXT PRIMARY KEY,fullName TEXT NOT NULL,birthDate TEXT NOT NULL,identityNumber TEXT,issueDate TEXT NOT NULL,permanentAddress TEXT NOT NULL,portraitId TEXT REFERENCES assets(id),idFrontId TEXT REFERENCES assets(id),idBackId TEXT REFERENCES assets(id),notes TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
   CREATE UNIQUE INDEX employee_identity_unique ON employees(identityNumber) WHERE identityNumber IS NOT NULL;
   CREATE TABLE assignments(id TEXT PRIMARY KEY,employeeId TEXT NOT NULL REFERENCES employees(id),projectId TEXT NOT NULL REFERENCES projects(id),startDate TEXT NOT NULL,endDate TEXT);
   CREATE UNIQUE INDEX assignment_current_unique ON assignments(employeeId) WHERE endDate IS NULL;
   CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
   PRAGMA user_version=1;
   COMMIT;`);
  this.db.prepare('INSERT OR IGNORE INTO settings(id,json) VALUES(1,?)').run(JSON.stringify(defaultSettings));
 }
 close(){if(!this.closed){this.db.close();this.closed=true;}}
 private transaction<T>(fn:()=>T):T {
  this.db.exec('BEGIN IMMEDIATE');
  try {const result=fn();this.db.exec('COMMIT');return result;} catch(error){this.db.exec('ROLLBACK');translateDbError(error);}
 }
 listProjects(includeArchived=false):Project[]{
  return (this.db.prepare(`SELECT p.*, (SELECT count(*) FROM assignments a JOIN employees e ON e.id=a.employeeId WHERE a.projectId=p.id AND a.endDate IS NULL AND e.archived=0) AS employeeCount FROM projects p ${includeArchived?'':'WHERE p.archived=0'} ORDER BY p.name COLLATE NOCASE`).all() as unknown as Project[]).map(p=>({...p,archived:!!p.archived}));
 }
 saveProject(input:ProjectInput):Project{
  const v=projectSchema.parse(input);const id=v.id??randomUUID();
  if(v.id && !this.db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw new Error('Không tìm thấy dự án.');
  if(v.archived) this.assertProjectArchivable(id);
  try {
   this.db.prepare('INSERT INTO projects(id,code,name,location,notes,archived) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,location=excluded.location,notes=excluded.notes,archived=excluded.archived').run(id,v.code,v.name,v.location,v.notes,Number(v.archived??false));
  }catch(e){translateDbError(e);}
  return this.listProjects(true).find(p=>p.id===id)!;
 }
 private assertProjectArchivable(id:string){
  if(this.listEmployees({projectId:id}).length) throw new Error('Dự án còn nhân viên đang sử dụng. Hãy chuyển hoặc lưu trữ nhân viên trước.');
 }
 archiveProject(id:string){
  if(!this.db.prepare('SELECT id FROM projects WHERE id=?').get(id))throw new Error('Không tìm thấy dự án.');
  this.assertProjectArchivable(id);this.db.prepare('UPDATE projects SET archived=1 WHERE id=?').run(id);
 }
 private requireProject(id:string){
  const p=this.db.prepare('SELECT archived FROM projects WHERE id=?').get(id);
  if(!p || p.archived)throw new Error('Dự án không tồn tại hoặc đã được lưu trữ.');
 }
 private requireAsset(id:string|null,kind:AssetKind){
  if(id===null)return;
  const a=this.getAsset(id);
  if(!a || a.kind!==kind)throw new Error('Ảnh không tồn tại hoặc không đúng loại: '+kind);
 }
 listEmployees(filter:EmployeeFilter={}):Employee[]{
  const conditions:string[]=[];const params:string[]=[];
  if(!filter.includeArchived)conditions.push('e.archived=0');
  if(filter.projectId){conditions.push('a.projectId=?');params.push(filter.projectId);}
  const rows=this.db.prepare(selectEmployees+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY e.fullName COLLATE NOCASE,e.id').all(...params) as unknown as Employee[];
  const search=normalizeSearch(filter.search??'').trim();
  return rows.map(e=>({...e,identityNumber:e.identityNumber??'',archived:!!e.archived})).filter(e=>!search||normalizeSearch(e.fullName+' '+e.identityNumber).includes(search));
 }
 getEmployee(id:string):Employee{
  const row=this.listEmployees({includeArchived:true}).find(e=>e.id===id);
  if(!row)throw new Error('Không tìm thấy nhân viên.');return row;
 }
 saveEmployee(input:EmployeeInput,startDate=localDate()):Employee{
  const v=employeeSchema.parse(input);this.requireProject(v.projectId);
  this.requireAsset(v.portraitId,'portrait');this.requireAsset(v.idFrontId,'idFront');this.requireAsset(v.idBackId,'idBack');
  if(v.id && this.getEmployee(v.id).projectId!==v.projectId) throw new Error('Dùng chức năng chuyển dự án để thay đổi dự án của nhân viên.');
  if(!v.id)requireDate(startDate,'Ngày bắt đầu');
  const id=v.id??randomUUID();const now=new Date().toISOString();
  this.transaction(()=>{
   this.db.prepare(`INSERT INTO employees(id,fullName,birthDate,identityNumber,issueDate,permanentAddress,portraitId,idFrontId,idBackId,notes,archived,createdAt,updatedAt)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fullName=excluded.fullName,birthDate=excluded.birthDate,identityNumber=excluded.identityNumber,issueDate=excluded.issueDate,permanentAddress=excluded.permanentAddress,portraitId=excluded.portraitId,idFrontId=excluded.idFrontId,idBackId=excluded.idBackId,notes=excluded.notes,archived=excluded.archived,updatedAt=excluded.updatedAt`)
    .run(id,v.fullName,v.birthDate,v.identityNumber||null,v.issueDate,v.permanentAddress.trim(),v.portraitId,v.idFrontId,v.idBackId,v.notes,Number(v.archived??false),now,now);
   if(!v.id)this.db.prepare('INSERT INTO assignments VALUES(?,?,?,?,NULL)').run(randomUUID(),id,v.projectId,startDate);
  });
  return this.getEmployee(id);
 }
 archiveEmployee(id:string,archived:boolean){
  const employee=this.getEmployee(id);
  if(!archived)this.requireProject(employee.projectId);
  this.db.prepare('UPDATE employees SET archived=?,updatedAt=? WHERE id=?').run(Number(archived),new Date().toISOString(),id);
 }
 history(id:string):Assignment[]{
  this.getEmployee(id);
  return this.db.prepare('SELECT a.*,p.name AS projectName FROM assignments a JOIN projects p ON p.id=a.projectId WHERE a.employeeId=? ORDER BY a.startDate DESC,a.rowid DESC').all(id) as unknown as Assignment[];
 }
 transferEmployee(id:string,projectId:string,date:string){
  requireDate(date,'Ngày chuyển');this.requireProject(projectId);
  const e=this.getEmployee(id);if(e.archived)throw new Error('Khôi phục hồ sơ trước khi chuyển dự án.');
  const current=this.history(id)[0];
  if(current.projectId===projectId)throw new Error('Nhân viên đang thuộc dự án này.');
  if(date<current.startDate)throw new Error('Ngày chuyển phải từ ngày bắt đầu dự án hiện tại.');
  if(date>localDate())throw new Error('Ngày chuyển không được ở tương lai.');
  this.transaction(()=>{
   this.db.prepare('UPDATE assignments SET endDate=? WHERE employeeId=? AND endDate IS NULL').run(date,id);
   this.db.prepare('INSERT INTO assignments VALUES(?,?,?,?,NULL)').run(randomUUID(),id,projectId,date);
   this.db.prepare('UPDATE employees SET updatedAt=? WHERE id=?').run(new Date().toISOString(),id);
  });
 }
 importAsset(kind:AssetKind,data:Uint8Array,filename:string):Asset{
  if(!['portrait','idFront','idBack','logo','signature'].includes(kind))throw new Error('Loại ảnh không hợp lệ.');
  const bytes=Buffer.from(data);
  if(!bytes.length || bytes.length>20*1024*1024)throw new Error('Ảnh phải nhỏ hơn 20 MB.');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!png&&!jpeg)throw new Error('Chỉ hỗ trợ ảnh PNG hoặc JPEG.');
  const id=randomUUID(),diskFilename=id+(png?'.png':'.jpg'),mime=png?'image/png':'image/jpeg';
  const file=join(this.dataDirectory,'assets',diskFilename);writeFileSync(file,bytes,{flag:'wx'});
  try{this.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?)').run(id,kind,basename(filename).slice(0,255),mime,diskFilename);}catch(e){unlinkSync(file);throw e;}
  return this.getAsset(id)!;
 }
 getAsset(id:string):Asset|null {
  const a=this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as unknown as StoredAsset|undefined;
  return a?{id:a.id,kind:a.kind,filename:a.filename,mime:a.mime,url:'thean://asset/'+a.id}:null;
 }
 assetRecords():StoredAsset[]{return this.db.prepare('SELECT * FROM assets').all() as unknown as StoredAsset[];}
 readAsset(id:string):{data:Buffer;mime:string}{
  const a=this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as unknown as StoredAsset|undefined;
  if(!a || !/^[0-9a-f-]{36}\.(png|jpg)$/.test(a.diskFilename))throw new Error('Không tìm thấy ảnh.');
  const file=join(this.dataDirectory,'assets',a.diskFilename);
  if(!existsSync(file))throw new Error('File ảnh đã bị mất. Hãy chọn lại ảnh hoặc khôi phục bản sao lưu.');
  return {data:readFileSync(file),mime:a.mime};
 }
 getSettings():CompanySettings{
  return settingsSchema.parse(JSON.parse(String(this.db.prepare('SELECT json FROM settings WHERE id=1').get()!.json)));
 }
 saveSettings(input:CompanySettings):CompanySettings{
  const settings=settingsSchema.parse(input);
  this.requireAsset(settings.logoId,'logo');this.requireAsset(settings.signatureId,'signature');
  this.db.prepare('UPDATE settings SET json=? WHERE id=1').run(JSON.stringify(settings));return settings;
 }
 snapshotDatabase(destination:string){this.db.prepare('VACUUM INTO ?').run(destination);}
}

