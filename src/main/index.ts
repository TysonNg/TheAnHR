import { app,BrowserWindow,dialog,ipcMain,protocol,shell,nativeImage } from 'electron';
import { join,resolve,sep,dirname,extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,renameSync,rmSync,existsSync } from 'node:fs';
import { z } from 'zod';
import { HRStore } from './store';
import { OcrService } from './ocr';
import { createBackup,restoreBackup } from './backup';
import { prepareExportSnapshot } from './export-snapshot';
import { buildReportDocx,buildReportHtml,reportWarnings } from './exporter';
import type { AssetKind,CompanySettings,EmployeeFilter,EmployeeInput,ExportRequest,ProjectInput } from '../shared/types';

protocol.registerSchemesAsPrivileged([{scheme:'thean',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const dataDirectory=resolve(process.env.THEANHR_DATA_DIRECTORY || join(process.env.LOCALAPPDATA||app.getPath('userData'),'TheAnHR','data'));
mkdirSync(join(dirname(dataDirectory),'runtime'),{recursive:true});
app.setPath('userData',join(dirname(dataDirectory),'runtime'));
const gotLock=app.requestSingleInstanceLock();
if(!gotLock)app.quit();
let window:BrowserWindow|undefined;
let store:HRStore;
let ocr:OcrService;
let exportJobs=0;
const previews=new Map<string,{pdf:Buffer;docx:Buffer;createdAt:number}>();
const uuid=z.string().uuid();
const nativeMimes:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const rendererDirectory=resolve(__dirname,'../renderer');
const contentSecurityPolicy="default-src 'self' thean:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' thean: data: blob:; frame-src 'self' thean: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'";
function errorMessage(error:unknown):string{
 if(error instanceof z.ZodError)return error.issues.map(i=>i.message).join('\n');
 return error instanceof Error?error.message:String(error);
}
function register(channel:string,fn:(...args:any[])=>unknown){
 ipcMain.handle(channel,async(event,...args)=>{
  if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Yêu cầu không hợp lệ.');
  try{return await fn(...args);}catch(error){throw new Error(errorMessage(error));}
 });
}
function writeOutput(file:string,bytes:Uint8Array){
 const temporary=file+'.'+randomUUID()+'.tmp';
 try{writeFileSync(temporary,bytes);renameSync(temporary,file);}finally{if(existsSync(temporary))rmSync(temporary);}
}
async function printPdf(html:string):Promise<Buffer>{
 const printer=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 printer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 try{
  await printer.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await printer.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images).map(i => i.complete ? Promise.resolve() : new Promise(r => { i.onload=r; i.onerror=r; }))])');
  return await printer.webContents.printToPDF({landscape:true,pageSize:'Letter',printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}});
 }finally{printer.destroy();}
}
function setupApi(){
 register('projects:list',(archived=false)=>store.listProjects(z.boolean().parse(archived)));
 register('projects:save',(input:ProjectInput)=>store.saveProject(input));
 register('projects:archive',(id:string)=>store.archiveProject(uuid.parse(id)));
 register('employees:list',(filter:EmployeeFilter={})=>store.listEmployees(z.object({projectId:z.string().uuid().optional(),search:z.string().max(500).optional(),includeArchived:z.boolean().optional()}).parse(filter)));
 register('employees:save',(input:EmployeeInput)=>store.saveEmployee(input));
 register('employees:archive',(id:string,archived:boolean)=>store.archiveEmployee(uuid.parse(id),z.boolean().parse(archived)));
 register('employees:history',(id:string)=>store.history(uuid.parse(id)));
 register('employees:transfer',(id:string,project:string,date:string)=>store.transferEmployee(uuid.parse(id),uuid.parse(project),z.string().parse(date)));
 register('assets:import',(kind:AssetKind,data:Uint8Array,filename:string)=>{
  if(!(data instanceof Uint8Array)||data.byteLength>20*1024*1024)throw new Error('Ảnh không hợp lệ hoặc vượt quá 20 MB.');
  const image=nativeImage.createFromBuffer(Buffer.from(data));
  if(image.isEmpty())throw new Error('Không đọc được ảnh. Hãy chọn file PNG hoặc JPEG hợp lệ.');
  const dimensions=image.getSize();if(dimensions.width*dimensions.height>40_000_000)throw new Error('Ảnh quá lớn. Hãy giảm kích thước ảnh trước khi tải lên.');
  return store.importAsset(kind,data,z.string().max(255).parse(filename));
 });
 register('assets:get',(id:string)=>store.getAsset(uuid.parse(id)));
 register('settings:get',()=>store.getSettings());
 register('settings:save',(settings:CompanySettings)=>store.saveSettings(settings));
 register('ocr:recognize',async(ids:string[])=>{
  const validated=z.array(uuid).min(1).max(2).parse(ids);
  const images=validated.map(id=>{
   const asset=store.getAsset(id);if(!asset||!['idFront','idBack'].includes(asset.kind))throw new Error('Chọn ảnh căn cước mặt trước hoặc mặt sau.');
   return store.readAsset(id).data;
  });
  return ocr.recognize(images,progress=>window?.webContents.send('ocr:progress',progress));
 });
 register('exports:preview',async(request:ExportRequest)=>{
  const snapshot=prepareExportSnapshot(store,request);exportJobs++;
  try{
   const pdf=await printPdf(buildReportHtml(snapshot));
   const docx=await buildReportDocx(snapshot);const token=randomUUID();
   for(const [key,value]of previews)if(Date.now()-value.createdAt>30*60*1000)previews.delete(key);
   while(previews.size>=3)previews.delete(previews.keys().next().value!);
   previews.set(token,{pdf,docx,createdAt:Date.now()});
   return {token,pdfUrl:'thean://preview/'+token,employeeCount:snapshot.employees.length,warnings:reportWarnings(snapshot.employees)};
  }finally{exportJobs--;}
 });
 register('exports:save',async(token:string,format:'docx'|'pdf'|'both')=>{
  const preview=previews.get(uuid.parse(token));z.enum(['docx','pdf','both']).parse(format);
  if(!preview)throw new Error('Bản xem trước đã hết hạn. Hãy tạo lại bản xem trước.');
  const result=await dialog.showSaveDialog(window!,{title:'Lưu lý lịch trích ngang',defaultPath:'Ly-lich-trich-ngang.'+(format==='docx'?'docx':'pdf'),filters:[{name:format==='docx'?'Word':'PDF',extensions:[format==='docx'?'docx':'pdf']}]});
  if(result.canceled||!result.filePath)return [];
  const primaryExt=format==='docx'?'.docx':'.pdf';
  const primary=extname(result.filePath).toLowerCase()===primaryExt?result.filePath:result.filePath+primaryExt;
  const paths=format==='both'?[primary,primary.slice(0,-4)+'.docx']:[primary];
  if(format==='both'&&existsSync(paths[1])){
   const confirmation=await dialog.showMessageBox(window!,{type:'question',buttons:['Ghi đè','Hủy'],defaultId:1,cancelId:1,message:'File Word đã tồn tại. Ghi đè file này?',detail:paths[1]});
   if(confirmation.response!==0)return [];
  }
  for(const path of paths)writeOutput(path,path.endsWith('.docx')?preview.docx:preview.pdf);
  return paths;
 });
 register('backup:create',async()=>{
  const result=await dialog.showSaveDialog(window!,{title:'Sao lưu hồ sơ, ảnh và cấu hình',defaultPath:'TheAnHR-'+new Date().toISOString().slice(0,10)+'.theanbackup',filters:[{name:'Sao lưu TheAnHR',extensions:['theanbackup']}]});
  if(result.canceled||!result.filePath)return null;
  createBackup(store,result.filePath);return result.filePath;
 });
 register('backup:restore',async()=>{
  if(ocr.isBusy||exportJobs)throw new Error('Đợi OCR hoặc xuất tài liệu hoàn tất trước khi khôi phục.');
  const selected=await dialog.showOpenDialog(window!,{title:'Chọn bản sao lưu TheAnHR',properties:['openFile'],filters:[{name:'Sao lưu TheAnHR',extensions:['theanbackup']}]});
  if(selected.canceled)return false;
  const confirm=await dialog.showMessageBox(window!,{type:'question',buttons:['Khôi phục','Hủy'],defaultId:1,cancelId:1,message:'Thay dữ liệu hiện tại bằng bản sao lưu?',detail:'Ứng dụng sẽ tự sao lưu dữ liệu hiện tại vào thư mục recovery trước khi thay thế.'});
  if(confirm.response!==0)return false;
  if(ocr.isBusy||exportJobs)throw new Error('Đợi tác vụ đang xử lý hoàn tất rồi thử lại.');
  try{store=restoreBackup(store,selected.filePaths[0]);}catch(error){
   // Reopen after a filesystem rollback, if the restore closed the previous connection.
   try{store.db.prepare('SELECT 1').get();}catch{store=new HRStore(dataDirectory);}throw error;
  }
  previews.clear();return true;
 });
 register('app:info',()=>({version:app.getVersion(),dataDirectory}));
 register('app:openDataDirectory',async()=>{const result=await shell.openPath(dataDirectory);if(result)throw new Error(result);});
}
async function setupProtocol(){
 protocol.handle('thean',request=>{
  try{
   const url=new URL(request.url);
   if(url.hostname==='asset'){
    const id=uuid.parse(url.pathname.slice(1)),asset=store.readAsset(id);
    return new Response(new Uint8Array(asset.data),{headers:{'Content-Type':asset.mime,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
   }
   if(url.hostname==='preview'){
    const token=uuid.parse(url.pathname.slice(1));const preview=previews.get(token);
    if(!preview)return new Response('Bản xem trước đã hết hạn.',{status:404});
    return new Response(new Uint8Array(preview.pdf),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}});
   }
   if(url.hostname==='app'){
    const file=resolve(rendererDirectory,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(rendererDirectory+sep))return new Response('Forbidden',{status:403});
    return new Response(new Uint8Array(readFileSync(file)),{headers:{'Content-Type':nativeMimes[extname(file)]||'application/octet-stream','Content-Security-Policy':contentSecurityPolicy}});
   }
  }catch{return new Response('Không tìm thấy tài nguyên.',{status:404});}
  return new Response('Not found',{status:404});
 });
}
app.on('second-instance',()=>{window?.restore();window?.show();window?.focus();});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>store?.close());
if(gotLock)app.whenReady().then(async()=>{
 mkdirSync(dataDirectory,{recursive:true});store=new HRStore(dataDirectory);
 ocr=new OcrService(app.isPackaged?join(process.resourcesPath,'ocr'):resolve(__dirname,'../../resources/ocr'));
 await setupProtocol();setupApi();
 window=new BrowserWindow({width:1380,height:900,minWidth:1040,minHeight:720,title:'TheAnHR — Quản lý nhân sự Thế An',backgroundColor:'#f7f6f2',show:false,autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{
  const allowed=process.env.ELECTRON_RENDERER_URL||'thean://app/';
  if(!url.startsWith(allowed))event.preventDefault();
 });
 window.once('ready-to-show',()=>window?.show());
 if(process.env.ELECTRON_RENDERER_URL)await window.loadURL(process.env.ELECTRON_RENDERER_URL);
 else await window.loadURL('thean://app/index.html');
}).catch(error=>{dialog.showErrorBox('Không mở được TheAnHR',errorMessage(error));app.quit();});


