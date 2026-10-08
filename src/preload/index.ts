import {contextBridge,ipcRenderer} from 'electron';
import type {TheAnAPI,OcrProgress} from '../shared/types';
const invoke=(channel:string,...args:unknown[])=>ipcRenderer.invoke(channel,...args);
const api:TheAnAPI={
 projects:{list:(archived=false)=>invoke('projects:list',archived),save:input=>invoke('projects:save',input),archive:id=>invoke('projects:archive',id)},
 employees:{list:(filter={})=>invoke('employees:list',filter),save:input=>invoke('employees:save',input),archive:(id,archived)=>invoke('employees:archive',id,archived),history:id=>invoke('employees:history',id),transfer:(id,project,date)=>invoke('employees:transfer',id,project,date)},
 assets:{import:(kind,data,name)=>invoke('assets:import',kind,data,name),get:id=>invoke('assets:get',id)},
 ocr:{recognize:ids=>invoke('ocr:recognize',ids),onProgress:callback=>{
  const handler=(_event:unknown,progress:OcrProgress)=>callback(progress);ipcRenderer.on('ocr:progress',handler);return()=>ipcRenderer.removeListener('ocr:progress',handler);
 }},
 settings:{get:()=>invoke('settings:get'),save:settings=>invoke('settings:save',settings)},
 exports:{preview:request=>invoke('exports:preview',request),save:(token,format)=>invoke('exports:save',token,format)},
 backup:{create:()=>invoke('backup:create'),restore:()=>invoke('backup:restore')},
 app:{info:()=>invoke('app:info'),openDataDirectory:()=>invoke('app:openDataDirectory')}
};
contextBridge.exposeInMainWorld('thean',api);

