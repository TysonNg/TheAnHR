import { createHash, randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdtempSync,mkdirSync,renameSync,rmSync,existsSync,statSync } from 'node:fs';
import { join,dirname,resolve } from 'node:path';
import { zipSync,unzipSync,strToU8,strFromU8 } from 'fflate';
import { DatabaseSync } from 'node:sqlite';
import { HRStore } from './store';
const maxSize=512*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const allowedName=(name:string)=>name==='manifest.json'||name==='hr.sqlite'||/^assets\/[0-9a-f-]{36}\.(png|jpg)$/.test(name);
interface Manifest {format:'TheAnHR';version:1;createdAt:string;files:Record<string,string>;}
export function createBackup(store:HRStore,destination:string):void {
 const work=mkdtempSync(join(dirname(store.dataDirectory),'.backup-'));
 try {
  const sqlite=join(work,'hr.sqlite');store.snapshotDatabase(sqlite);
  const files:Record<string,Uint8Array>={'hr.sqlite':readFileSync(sqlite)};
  let total=files['hr.sqlite'].length;
  for(const asset of store.assetRecords()){
   const bytes=store.readAsset(asset.id).data;total+=bytes.length;
   if(total>maxSize)throw new Error('Dữ liệu sao lưu vượt quá 512 MB.');
   files['assets/'+asset.diskFilename]=bytes;
  }
  const manifest:Manifest={format:'TheAnHR',version:1,createdAt:new Date().toISOString(),files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,hash(data)]))};
  files['manifest.json']=strToU8(JSON.stringify(manifest));
  const target=resolve(destination),temporary=target+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temporary,zipSync(files,{level:1}));renameSync(temporary,target);}finally{if(existsSync(temporary))rmSync(temporary);}
 }finally{rmSync(work,{recursive:true,force:true});}
}
export function restoreBackup(store:HRStore,source:string):HRStore {
 if(statSync(source).size>maxSize)throw new Error('File sao lưu quá lớn.');
 let total=0;let files:Record<string,Uint8Array>;
 try{files=unzipSync(readFileSync(source),{filter:entry=>{
  if(!allowedName(entry.name))throw new Error('Đường dẫn trong bản sao lưu không hợp lệ.');
  total+=entry.originalSize;if(total>maxSize)throw new Error('Dữ liệu giải nén quá lớn.');
  return true;
 }});}catch{throw new Error('File sao lưu không hợp lệ hoặc bị hỏng. Dữ liệu hiện tại được giữ nguyên.');}
 let manifest:Manifest;
 try{
  manifest=JSON.parse(strFromU8(files['manifest.json']));
  if(manifest.format!=='TheAnHR'||manifest.version!==1||!manifest.files||!files['hr.sqlite'])throw new Error();
  const names=Object.keys(files).filter(k=>k!=='manifest.json');
  if(names.length!==Object.keys(manifest.files).length)throw new Error();
  for(const name of names)if(!allowedName(name)||hash(files[name])!==manifest.files[name])throw new Error();
 }catch{throw new Error('Bản sao lưu không đúng định dạng hoặc không toàn vẹn.');}
 const directory=resolve(store.dataDirectory),parent=dirname(directory);
 const staged=mkdtempSync(join(parent,'.restore-')),old=join(parent,'.replaced-'+randomUUID());
 let swapped=false;
 try{
  mkdirSync(join(staged,'assets'));
  for(const [name,bytes] of Object.entries(files))if(name!=='manifest.json')writeFileSync(join(staged,...name.split('/')),bytes);
  const check=new DatabaseSync(join(staged,'hr.sqlite'),{readOnly:true});
  try{
   if(check.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Database trong bản sao lưu bị hỏng.');
   if(Number(check.prepare('PRAGMA user_version').get()?.user_version)!==1)throw new Error('Phiên bản bản sao lưu không tương thích.');
   if(check.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Liên kết hồ sơ trong bản sao lưu không hợp lệ.');
   const missing=check.prepare('SELECT e.id FROM employees e LEFT JOIN assignments a ON a.employeeId=e.id AND a.endDate IS NULL GROUP BY e.id HAVING COUNT(a.id)<>1').all();
   if(missing.length)throw new Error('Dự án hiện tại của nhân viên không hợp lệ.');
  }finally{check.close();}
  const candidate=new HRStore(staged);
  try{
   const settings=candidate.getSettings();
   for(const a of candidate.assetRecords())candidate.readAsset(a.id);
   for(const id of [settings.logoId,settings.signatureId])if(id&&!candidate.getAsset(id))throw new Error('Thiếu ảnh cấu hình.');
   for(const e of candidate.listEmployees({includeArchived:true}))
    for(const id of [e.portraitId,e.idFrontId,e.idBackId])if(id&&!candidate.getAsset(id))throw new Error('Thiếu ảnh nhân viên.');
  }finally{candidate.close();}
  const recovery=join(parent,'recovery');mkdirSync(recovery,{recursive:true});
  createBackup(store,join(recovery,'before-restore-'+Date.now()+'-'+randomUUID()+'.theanbackup'));
  store.close();
  renameSync(directory,old);
  try{renameSync(staged,directory);swapped=true;}catch(error){renameSync(old,directory);throw error;}
  let restored:HRStore;
  try{restored=new HRStore(directory);}catch(error){
   renameSync(directory,staged);renameSync(old,directory);swapped=false;throw error;
  }
  // old and staged are generated siblings; never delete user-selected archive paths.
  if(dirname(resolve(old))===parent && old.startsWith(join(parent,'.replaced-')))rmSync(old,{recursive:true,force:true});
  return restored;
 }finally{
  if(!swapped&&existsSync(staged))rmSync(staged,{recursive:true,force:true});
 }
}

