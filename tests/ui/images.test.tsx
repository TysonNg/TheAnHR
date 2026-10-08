import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ImageEditor } from '../../src/renderer/src/Images';
const asset={id:'original',kind:'idFront' as const,filename:'can-cuoc.jpg',mime:'image/jpeg',url:'thean://asset/original'};
const context={translate:vi.fn(),rotate:vi.fn(),drawImage:vi.fn(),setTransform:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),fill:vi.fn(),strokeRect:vi.fn(),fillStyle:'',strokeStyle:'',lineWidth:0};
let imported:ReturnType<typeof vi.fn>;let outputs:{width:number;height:number}[];
beforeEach(()=>{
 vi.clearAllMocks();outputs=[];
 class TestImage {naturalWidth=400;naturalHeight=200;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(_:string){queueMicrotask(()=>this.onload?.());}}
 vi.stubGlobal('Image',TestImage);
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new Blob(['input'])})));
 Object.defineProperty(URL,'createObjectURL',{configurable:true,writable:true,value:vi.fn(()=> 'blob:editor-source')});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,writable:true,value:vi.fn()});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>context as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback){outputs.push({width:this.width,height:this.height});const blob=new Blob(['output'],{type:'image/png'});Object.defineProperty(blob,'arrayBuffer',{value:async()=>new Uint8Array([7,8,9]).buffer});callback(blob);});
 imported=vi.fn(async()=>({...asset,id:'modified',url:'thean://asset/modified'}));
 window.thean={assets:{import:imported}} as unknown as typeof window.thean;
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('rotates then crops the chosen coordinates and imports modified PNG bytes',async()=>{
 const saved=vi.fn();render(<ImageEditor asset={asset} kind="idFront" notify={vi.fn()} onClose={vi.fn()} onSave={saved}/>);
 const rotate=await screen.findByRole('button',{name:'Xoay 90°'});await waitFor(()=>expect(rotate).toBeEnabled());fireEvent.click(rotate);
 expect(screen.getByLabelText('Chiều rộng')).toHaveValue(200);expect(screen.getByLabelText('Chiều cao')).toHaveValue(400);
 for(const [label,value] of [['Vị trí ngang','10'],['Vị trí dọc','20'],['Chiều rộng','40'],['Chiều cao','60']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Lưu ảnh đã chỉnh'}));
 await waitFor(()=>expect(imported).toHaveBeenCalledWith('idFront',new Uint8Array([7,8,9]),'can-cuoc-edited.png'));
 expect(outputs).toEqual([{width:40,height:60}]);expect(context.rotate).toHaveBeenCalledWith(Math.PI/2);
 expect(context.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),10,20,40,60,0,0,40,60);
 expect(saved).toHaveBeenCalledWith('modified');
});
it('does not submit an enclosing employee form when rotating an image',async()=>{
 const submit=vi.fn();render(<form onSubmit={e=>{e.preventDefault();submit();}}><ImageEditor asset={asset} kind="idFront" notify={vi.fn()} onClose={vi.fn()} onSave={vi.fn()}/></form>);
 const rotate=screen.getByRole('button',{name:'Xoay 90°'});await waitFor(()=>expect(rotate).toBeEnabled());fireEvent.click(rotate);
 expect(submit).not.toHaveBeenCalled();
});
it('revokes the temporary source blob URL on editor close',async()=>{
 const view=render(<ImageEditor asset={asset} kind="idFront" notify={vi.fn()} onClose={vi.fn()} onSave={vi.fn()}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Xoay 90°'})).toBeEnabled());view.unmount();
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:editor-source');
});
it('reads image bytes via IPC assets:read and renders coordinate placeholders',async()=>{
 const readAsset=vi.fn(async()=>({data:new Uint8Array([1,2,3]),mime:'image/jpeg'}));
 window.thean={assets:{import:imported,read:readAsset}} as unknown as typeof window.thean;
 render(<ImageEditor asset={asset} kind="idFront" notify={vi.fn()} onClose={vi.fn()} onSave={vi.fn()}/>);
 await waitFor(()=>expect(readAsset).toHaveBeenCalledWith(asset.id));
 expect(screen.getByLabelText('Vị trí ngang')).toHaveAttribute('placeholder','0');
 expect(screen.getByLabelText('Vị trí dọc')).toHaveAttribute('placeholder','0');
 expect(screen.getByLabelText('Chiều rộng')).toHaveAttribute('placeholder','px');
 expect(screen.getByLabelText('Chiều cao')).toHaveAttribute('placeholder','px');
});
