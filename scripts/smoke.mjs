import {_electron as electron,expect} from '@playwright/test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {unzipSync,strFromU8} from 'fflate';
const root=resolve('.'),temporary=mkdtempSync(join(tmpdir(),'thean-desktop-'));
const output=resolve('test-results/desktop');mkdirSync(output,{recursive:true});
const packaged=process.argv[2];
const executable=packaged||createRequire(import.meta.url)('electron');
const environment={...process.env,THEANHR_DATA_DIRECTORY:join(temporary,'data'),ELECTRON_ENABLE_LOGGING:'1'};
delete environment.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({executablePath:executable,args:packaged?[]:[root],env:environment,timeout:60000});
let app;
try{
 app=await launch();
 const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',e=>console.error('Renderer error:',e.message));
 await page.getByRole('button',{name:'Thêm dự án',exact:true}).waitFor({timeout:30000});
 await expect(page.getByText('Chưa có dự án',{exact:true})).toBeVisible();
 const fixture=await page.evaluate(async()=>{
  const p=await window.thean.projects.save({code:'NM01',name:'Nhà máy kiểm thử',location:'Bình Dương',notes:'Dữ liệu kiểm thử, không phải nhân viên thật.'});
  const p2=await window.thean.projects.save({code:'VP01',name:'Văn phòng kiểm thử',location:'TP.HCM',notes:''});
  const card=document.createElement('canvas');card.width=1800;card.height=1100;const ctx=card.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1800,1100);ctx.fillStyle='#000';ctx.font='42px Arial';
  const lines=['CĂN CƯỚC CÔNG DÂN','Số / No.: 079090001234','Họ và tên / Full name:','NGUYỄN VĂN THỬ','Ngày sinh / Date of birth: 10/02/1990','Giới tính / Sex: Nam','Quê quán / Place of origin: Bình Định','Nơi thường trú / Place of residence:','123 Nguyễn Trãi, Phường Bến Thành,','Thành phố Hồ Chí Minh','Ngày cấp: 20/08/2022'];
  lines.forEach((line,i)=>ctx.fillText(line,50,70+i*86));
  const blob=await new Promise(r=>card.toBlob(r,'image/png'));const bytes=new Uint8Array(await blob.arrayBuffer());
  const front=await window.thean.assets.import('idFront',bytes,'CCCD-gia-lap.png');
  const avatar=document.createElement('canvas');avatar.width=240;avatar.height=320;const ac=avatar.getContext('2d');ac.fillStyle='#e7e4dd';ac.fillRect(0,0,240,320);ac.fillStyle='#8b8983';ac.beginPath();ac.arc(120,100,45,0,Math.PI*2);ac.fill();ac.fillRect(55,165,130,155);
  const ab=await new Promise(r=>avatar.toBlob(r,'image/png'));const portrait=await window.thean.assets.import('portrait',new Uint8Array(await ab.arrayBuffer()),'portrait-test.png');
  const e=await window.thean.employees.save({projectId:p.id,fullName:'Nguyễn Văn Thử',birthDate:'1990-02-10',identityNumber:'079090001234',issueDate:'2022-08-20',permanentAddress:'123 Nguyễn Trãi, Phường Bến Thành, Thành phố Hồ Chí Minh',portraitId:portrait.id,idFrontId:front.id,idBackId:null,notes:''});
  const second=await window.thean.employees.save({projectId:p.id,fullName:'Trần Thị Kiểm Thử',birthDate:'1988-03-09',identityNumber:'001234567890',issueDate:'2023-10-08',permanentAddress:'Địa chỉ dài để kiểm tra xuống dòng trong bảng, Phường Kiểm Thử, Thành phố Hồ Chí Minh',portraitId:portrait.id,idFrontId:null,idBackId:null,notes:''});
  return {p,p2,e,second,front,portrait};
 });
 await page.reload();await page.getByText('Nhà máy kiểm thử',{exact:true}).waitFor();
 await page.screenshot({path:join(output,'projects.png'),fullPage:true});
 await page.getByRole('button',{name:'Nhân viên',exact:true}).click();
 await page.getByRole('button',{name:'Mở hồ sơ Nguyễn Văn Thử'}).click();
 await page.getByRole('textbox',{name:'Hộ khẩu thường trú',exact:true}).fill('');
 await page.getByLabel('Số căn cước',{exact:true}).fill('');
 await page.getByRole('button',{name:'Đọc căn cước',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Hộ khẩu thường trú',exact:true})).toHaveValue(/Nguyễn Trãi/, {timeout:120000});
 await expect(page.getByLabel('Số căn cước',{exact:true})).toHaveValue('079090001234',{timeout:120000});
 await page.getByRole('textbox',{name:'Hộ khẩu thường trú',exact:true}).fill('Địa chỉ sửa sau OCR, TP.HCM');
 await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const saved=await page.evaluate(()=>window.thean.employees.list());
 expect(saved.find(e=>e.id===fixture.e.id)?.permanentAddress).toBe('Địa chỉ sửa sau OCR, TP.HCM');
 await page.screenshot({path:join(output,'employees.png'),fullPage:true});
 // Real transfer service and history, using today's selected date.
 const history=await page.evaluate(async({id,project})=>{
  const date=new Date();const today=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  await window.thean.employees.transfer(id,project,today);return window.thean.employees.history(id);
 },{id:fixture.second.id,project:fixture.p2.id});
 expect(history).toHaveLength(2);expect(history[0].projectId).toBe(fixture.p2.id);
 // Mock ONLY native file chooser / confirmation boundaries, use actual export and backup services.
 await app.evaluate(({dialog},paths)=>{
  dialog.showSaveDialog=async(_win,options)=>({canceled:false,filePath:options.title.includes('Sao lưu')?paths.backup:paths.pdf});
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[paths.backup]});
  dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});
 },{backup:join(output,'smoke.theanbackup'),pdf:join(output,'report.pdf')});
 await page.getByRole('button',{name:'Xuất lý lịch',exact:true}).click();
 await page.getByLabel('Dự án xuất').selectOption(fixture.p.id);
 const people=await page.evaluate(()=>window.thean.employees.list());
 const current=people.find(e=>e.id===fixture.e.id);
 await page.getByLabel('Chọn '+current.fullName,{exact:true}).check();
 await page.getByLabel('Ngày ký',{exact:true}).fill('2026-10-08');
 await page.getByRole('button',{name:'Xem trước PDF',exact:true}).click();
 await page.getByTitle('Bản xem trước lý lịch').waitFor({timeout:60000});
 await page.screenshot({path:join(output,'export.png'),fullPage:true});
 await page.getByRole('button',{name:'Lưu cả Word và PDF',exact:true}).click();
 await expect.poll(()=>existsSync(join(output,'report.docx')),{timeout:30000}).toBe(true);
 const docx=unzipSync(readFileSync(join(output,'report.docx'))),xml=strFromU8(docx['word/document.xml']);
 expect(xml).toContain('ngày 08 tháng 10 năm 2026');expect(xml).toContain('Địa chỉ sửa sau OCR');expect(xml).not.toContain('Trần Thị Kiểm Thử');
 expect(readFileSync(join(output,'report.pdf')).subarray(0,5).toString()).toBe('%PDF-');
 const backup=await page.evaluate(()=>window.thean.backup.create());expect(backup).toBe(join(output,'smoke.theanbackup'));
 await page.evaluate(()=>window.thean.projects.save({code:'AFTER',name:'Không còn sau khôi phục',location:'',notes:''}));
 expect(await page.evaluate(()=>window.thean.projects.list())).toHaveLength(3);
 expect(await page.evaluate(()=>window.thean.backup.restore())).toBe(true);
 expect(await page.evaluate(()=>window.thean.projects.list())).toHaveLength(2);
 await page.getByRole('button',{name:'Cấu hình',exact:true}).click();
 await page.getByLabel('Tên công ty',{exact:true}).waitFor();
 await page.screenshot({path:join(output,'settings.png'),fullPage:true});
 await app.close();app=await launch();
 const fresh=await app.firstWindow();await fresh.getByRole('button',{name:'Thêm dự án',exact:true}).waitFor();
 const persisted=await fresh.evaluate(()=>window.thean.employees.list());
 expect(persisted.find(e=>e.identityNumber==='079090001234').permanentAddress).toBe('Địa chỉ sửa sau OCR, TP.HCM');
 writeFileSync(join(output,'results.json'),JSON.stringify({passed:true,packaged:!!packaged,checks:['empty profile','offline OCR synthetic card','editable HKTT','project transfer history','selected Word/PDF/date','backup/restore','cold reopen'],dataDirectory:temporary},null,2));
 console.log('Desktop smoke passed: OCR local, edit/save, transfer, Word/PDF, backup/restore, cold reopen. Screenshots: '+output);
}finally{if(app)await app.close();}



