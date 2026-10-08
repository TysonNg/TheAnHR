import {z} from 'zod';
import {HRStore} from './store';
import type {ExportRequest} from '../shared/types';
import type {ExportSnapshot} from './exporter';
import {requireDate} from '../shared/dates';
const requestSchema=z.object({projectId:z.string().uuid(),employeeIds:z.array(z.string().uuid()).min(1,'Chọn ít nhất một nhân viên.').max(500,'Tối đa 500 nhân viên mỗi lần xuất.'),signingDate:z.string()});
export function prepareExportSnapshot(store:HRStore,input:ExportRequest):ExportSnapshot {
 const request=requestSchema.parse(input);requireDate(request.signingDate,'Ngày ký');
 if(new Set(request.employeeIds).size!==request.employeeIds.length)throw new Error('Danh sách xuất có nhân viên trùng.');
 const eligible=new Map(store.listEmployees({projectId:request.projectId}).map(e=>[e.id,e]));
 const employees=request.employeeIds.map(id=>{
  const e=eligible.get(id);if(!e)throw new Error('Nhân viên đã đổi dự án, được lưu trữ hoặc không thuộc dự án đã chọn. Hãy chọn lại danh sách.');
  return {...e};
 });
 const settings=store.getSettings();
 const ids=new Set([settings.logoId,settings.signatureId,...employees.map(e=>e.portraitId)].filter((id):id is string=>!!id));
 const assets:ExportSnapshot['assets']={};let total=0;
 for(const id of ids){assets[id]=store.readAsset(id);total+=assets[id].data.length;if(total>100*1024*1024)throw new Error('Ảnh xuất vượt 100 MB. Hãy dùng ảnh nhẹ hơn hoặc chia danh sách.');}
 return {employees,settings:{...settings},signingDate:request.signingDate,assets};
}

