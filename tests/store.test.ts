import { describe,it,expect,beforeEach,afterEach } from 'vitest';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HRStore } from '../src/main/store';
import type { EmployeeInput } from '../src/shared/types';
let dir:string; let store:HRStore;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'thean-test-'));store=new HRStore(dir);});
afterEach(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
const project=(code='P1')=>store.saveProject({code,name:'Dự án '+code,location:'HCM',notes:''});
const employee=(projectId:string, identityNumber='001234567890'):EmployeeInput=>({projectId,fullName:'Nguyễn Văn Test',birthDate:'1990-02-10',identityNumber,issueDate:'2022-09-01',permanentAddress:'123 Đường Thử, TP.HCM',portraitId:null,idFrontId:null,idBackId:null,notes:''});
describe('local employee storage',()=>{
 it('starts empty and persists employee including leading-zero ID across reopening',()=>{const p=project();const saved=store.saveEmployee(employee(p.id));store.close();store=new HRStore(dir);expect(store.listEmployees()[0]).toMatchObject({id:saved.id,identityNumber:'001234567890',permanentAddress:'123 Đường Thử, TP.HCM',projectName:'Dự án P1'});});
 it('prevents duplicate identities even when an employee is archived',()=>{const p=project();const e=store.saveEmployee(employee(p.id));store.archiveEmployee(e.id,true);expect(()=>store.saveEmployee({...employee(p.id),fullName:'Khác'})).toThrow(/trùng|tồn tại/i);expect(store.listEmployees({includeArchived:true})).toHaveLength(1);});
 it('allows missing optional fields but requires employee name and project',()=>{const p=project();expect(()=>store.saveEmployee({...employee(p.id,''),fullName:'  '})).toThrow();const e=store.saveEmployee({...employee(p.id,''),birthDate:'',issueDate:'',permanentAddress:''});expect(e.identityNumber).toBe('');expect(()=>store.saveEmployee({...employee('missing'),identityNumber:''})).toThrow();});
 it('moves exactly once and retains previous assignment dates',()=>{const a=project('A'),b=project('B');const e=store.saveEmployee(employee(a.id),'2026-01-01');store.transferEmployee(e.id,b.id,'2026-03-01');expect(store.listEmployees({projectId:a.id})).toHaveLength(0);expect(store.listEmployees({projectId:b.id})[0].id).toBe(e.id);expect(store.history(e.id)).toEqual([expect.objectContaining({projectId:b.id,startDate:'2026-03-01',endDate:null}),expect.objectContaining({projectId:a.id,startDate:'2026-01-01',endDate:'2026-03-01'})]);});
 it('rejects invalid and backdated transfers without altering assignment',()=>{const a=project('A'),b=project('B');const e=store.saveEmployee(employee(a.id),'2026-03-01');expect(()=>store.transferEmployee(e.id,b.id,'2026-02-01')).toThrow();expect(()=>store.transferEmployee(e.id,b.id,'2026-02-30')).toThrow();expect(store.history(e.id)).toHaveLength(1);expect(store.listEmployees()[0].projectId).toBe(a.id);});
 it('requires explicit transfer rather than silently changing project on edit',()=>{const a=project('A'),b=project('B');const e=store.saveEmployee(employee(a.id));expect(()=>store.saveEmployee({...e,projectId:b.id})).toThrow(/chuyển/i);});
 it('rejects archiving a project with current unarchived employees',()=>{const p=project();store.saveEmployee(employee(p.id));expect(()=>store.archiveProject(p.id)).toThrow();expect(store.listProjects()[0].archived).toBe(false);});
 it('searches Vietnamese names without accents and excludes archived records by default',()=>{const p=project();const e=store.saveEmployee(employee(p.id));expect(store.listEmployees({search:'nguyen van'})).toHaveLength(1);store.archiveEmployee(e.id,true);expect(store.listEmployees()).toHaveLength(0);expect(store.listEmployees({includeArchived:true})).toHaveLength(1);});
 it('keeps edits, including manually corrected OCR address, on save',()=>{const p=project();const e=store.saveEmployee(employee(p.id));store.saveEmployee({...e,permanentAddress:'Địa chỉ đã sửa',fullName:'Trần Văn Test'});expect(store.listEmployees()[0]).toMatchObject({permanentAddress:'Địa chỉ đã sửa',fullName:'Trần Văn Test'});});
 it('stores imported image bytes independently from original filename',()=>{const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');const asset=store.importAsset('portrait',bytes,'../../portrait.png');expect(asset.url).toBe('thean://asset/'+asset.id);expect(store.readAsset(asset.id).data).toEqual(bytes);expect(()=>store.importAsset('logo',Buffer.from('<svg/>'),'a.svg')).toThrow();});
 it('does not accept nonexistent assets or mismatched image roles',()=>{const p=project();expect(()=>store.saveEmployee({...employee(p.id),portraitId:'missing'})).toThrow();});
 it('rejects malformed calendar dates instead of normalizing them',()=>{const p=project();expect(()=>store.saveEmployee({...employee(p.id),birthDate:'2023-02-29'})).toThrow();expect(()=>store.saveEmployee({...employee(p.id),issueDate:'2024-13-01'})).toThrow();});
});

