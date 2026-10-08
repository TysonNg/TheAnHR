import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { mkdtempSync,rmSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';import { tmpdir } from 'node:os';import { zipSync,strToU8 } from 'fflate';
import { HRStore } from '../src/main/store';import { createBackup,restoreBackup } from '../src/main/backup';
let dir:string;let store:HRStore;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'thean-backup-'));store=new HRStore(join(dir,'data'));});
afterEach(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
describe('complete local backups',()=>{
 it('restores database, settings, and original imported image bytes together',()=>{
  const p=store.saveProject({code:'T',name:'Dự án thử',location:'',notes:''});
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const asset=store.importAsset('logo',image,'logo.png');store.saveSettings({...store.getSettings(),companyName:'Công ty thử',logoId:asset.id});
  const file=join(dir,'save.theanbackup');createBackup(store,file);
  store.saveProject({...p,name:'Tên đã đổi'});
  store=restoreBackup(store,file);
  expect(store.listProjects()[0].name).toBe('Dự án thử');expect(store.getSettings().companyName).toBe('Công ty thử');
  expect(store.readAsset(asset.id).data).toEqual(image);expect(existsSync(join(dir,'recovery'))).toBe(true);
 });
 it('rejects malicious paths before touching the existing data',()=>{
  const file=join(dir,'bad.theanbackup');writeFileSync(file,zipSync({'../outside.txt':strToU8('bad')}));
  expect(()=>restoreBackup(store,file)).toThrow();expect(store.listProjects()).toEqual([]);expect(existsSync(join(dir,'outside.txt'))).toBe(false);
 });
 it('rejects damaged archives and preserves the live store',()=>{
  const p=store.saveProject({code:'T',name:'Dự án thử',location:'',notes:''});const file=join(dir,'bad.theanbackup');writeFileSync(file,Buffer.from('corrupt'));
  expect(()=>restoreBackup(store,file)).toThrow();expect(store.listProjects()[0].id).toBe(p.id);
 });
});

