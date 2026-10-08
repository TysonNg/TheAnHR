// Real browser rendering check. Test-only IPC boundary; no fixtures ship in the renderer.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
const server = await createServer({ configFile: false, root: path.resolve('src/renderer'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
 await server.listen();
 browser = await chromium.launch({ channel: 'msedge', headless: true });
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.addInitScript(() => {
  const settings={companyName:'',address:'',email:'',signingPlace:'',signingDepartment:'',signerName:'',logoId:null,signatureId:null};
  window.thean={projects:{list:async()=>[],save:async input=>({...input,id:'test-project',employeeCount:0,archived:false}),archive:async()=>{}},employees:{list:async()=>[],history:async()=>[]},settings:{get:async()=>settings,save:async input=>input},app:{info:async()=>({version:'test',dataDirectory:'Test-only data directory'}),openDataDirectory:async()=>{}},backup:{create:async()=>null,restore:async()=>false},assets:{get:async()=>null},ocr:{onProgress:()=>()=>{}}};
 });
 const address=server.httpServer.address();
 await page.goto(`http://127.0.0.1:${address.port}`);
 await page.getByText('Chưa có dự án',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Thêm dự án',exact:true}).click();
 await page.getByLabel('Tên dự án').fill('Dự án kiểm tra bố cục');
 assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Nhân viên',exact:true}).click();
 await page.getByText('Chưa có nhân viên phù hợp',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();
 await page.getByLabel('Hộ khẩu thường trú').fill('Địa chỉ nhập thủ công trong kiểm thử');
 await page.getByRole('button',{name:'Đọc căn cước',exact:true}).click();
 await page.getByText('Vui lòng tải ít nhất một ảnh căn cước trước khi đọc.',{exact:true}).waitFor();
 await page.screenshot({path:'tests/ui/browser-employee.png',fullPage:true});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Xuất lý lịch',exact:true}).click();
 await page.getByText('Chọn dự án để xuất',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cấu hình',exact:true}).click();
 await page.getByLabel('Tên công ty').waitFor();
 await page.screenshot({path:'tests/ui/browser-settings.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Desktop layout must fit horizontally');
 await page.setViewportSize({width:1000,height:800});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Narrow desktop layout must fit horizontally');
 assert.deepEqual(errors,[]);
 console.log('Browser smoke passed: all pages, empty API data, editable HKTT, missing OCR images, focus/Escape, 1440px/1000px layouts.');
} finally { await browser?.close(); await server.close(); }
