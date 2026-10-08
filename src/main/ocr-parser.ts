import type { OcrResult } from '../shared/types';
import { validDate } from '../shared/dates';
import { normalizeSearch } from './store';
type Field=keyof OcrResult['fields'];
const patterns:{field:Field;regex:RegExp}[]=[
 {field:'fullName',regex:/ho[, ]*(?:chu dem va ten khai sinh|va ten)|full name/},
 {field:'birthDate',regex:/ngay[, ]*(?:thang[, ]*nam )?sinh|date of birth/},
 {field:'identityNumber',regex:/so dinh danh ca nhan|personal identification|^so\b|^no\s*[.:]/},
 {field:'permanentAddress',regex:/noi thuong tru|noi cu tru|place of residence|permanent residence/},
 {field:'issueDate',regex:/ngay cap|date of issue|^ngay[, ]*thang[, ]*nam\b|date,? month,? year/}
];
const stopLabels=/gioi tinh|sex\b|quoc tich|nationality|que quan|place of origin|co gia tri|date of expiry|dac diem|identification features|cuc truong|bo cong an|cong an|socialist|can cuoc|citizen|identity card|chu ky|signature|^idvnm|^[A-Z0-9<]{25,}$/i;
function identify(line:string){const norm=normalizeSearch(line);return patterns.find(p=>p.regex.test(norm));}
function dateValue(text:string):string|undefined{
 const m=text.match(/\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})\b/);
 if(!m)return;
 const result=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return validDate(result)?result:undefined;
}
function afterLabel(line:string,field:Field):string{
 const colon=line.lastIndexOf(':');if(colon>=0)return line.slice(colon+1).trim();
 const norm=normalizeSearch(line);
 const english:Partial<Record<Field,RegExp>>={fullName:/full name/,permanentAddress:/place of residence|permanent residence/,birthDate:/date of birth/,identityNumber:/personal identification number|\bno\.?/,issueDate:/date of issue|date,? month,? year/};
 const eng=english[field]?.exec(norm);if(eng)return line.slice(eng.index+eng[0].length).replace(/^\s*[-/.]\s*/,'').trim();
 const vi=identify(line);const match=vi?.regex.exec(norm);return match?line.slice(match.index+match[0].length).replace(/^\s*[-/.]\s*/,'').trim():'';
}
export function parseIdentityText(text:string):OcrResult{
 const lines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
 const fields:OcrResult['fields']={};
 for(let i=0;i<lines.length;i++){
  const label=identify(lines[i]);if(!label)continue;
  const field=label.field;let content=afterLabel(lines[i],field);
  if(!content && i+1<lines.length && !identify(lines[i+1])&&!stopLabels.test(normalizeSearch(lines[i+1])))content=lines[i+1];
  if(field==='permanentAddress'){
   const parts=content?[content]:[];
   let j=i+1;
   if(content===lines[j])j++;
   for(;j<lines.length;j++){
    if(identify(lines[j])||stopLabels.test(normalizeSearch(lines[j]))||/^[A-Z0-9<]{25,}$/.test(lines[j]))break;
    parts.push(lines[j]);
   }
   if(parts.length)fields.permanentAddress=parts.join(' ').trim();
  }else if(field==='birthDate'||field==='issueDate'){
   const date=dateValue(content||lines[i]);if(date)fields[field]=date;
  }else if(field==='identityNumber'){
   const number=content.match(/\b(?:\d[ ]*){12}\b|\b\d{9}\b/);
   if(number)fields.identityNumber=number[0].replace(/ /g,'');
  }else if(content&&!stopLabels.test(normalizeSearch(content))){fields.fullName=content.replace(/^\/+\s*/,'').trim();}
 }
 if(!fields.identityNumber){
  const id=text.match(/\b\d{12}\b/);if(id)fields.identityNumber=id[0];
 }
 const names:Record<Field,string>={fullName:'họ tên',birthDate:'ngày sinh',identityNumber:'số căn cước',issueDate:'ngày cấp',permanentAddress:'HKTT'};
 const missing=(Object.keys(names) as Field[]).filter(k=>!fields[k]);
 const warnings=Object.keys(fields).length===0?['Không nhận dạng được thông tin. Hãy dùng ảnh rõ hơn hoặc nhập tay.']:missing.length?['Chưa đọc được: '+missing.map(k=>names[k]).join(', ')+'. Bạn có thể nhập hoặc chỉnh sửa trực tiếp.']:[];
 return {fields,text,warnings};
}

