import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker,OEM,PSM } from 'tesseract.js';
import type { OcrProgress,OcrResult } from '../shared/types';
import { parseIdentityText } from './ocr-parser';
export class OcrService {
 private busy=false;
 constructor(private readonly resourcesDirectory:string){}
 async recognize(images:Uint8Array[],progress:(p:OcrProgress)=>void=()=>{}):Promise<OcrResult>{
  if(this.busy)throw new Error('OCR đang xử lý. Vui lòng đợi hoàn tất.');
  if(images.length<1||images.length>2)throw new Error('Chọn một hoặc hai ảnh căn cước.');
  for(const lang of ['vie','eng'])if(!existsSync(join(this.resourcesDirectory,lang+'.traineddata.gz')))throw new Error('Thiếu dữ liệu OCR offline. Hãy cài lại ứng dụng hoặc chạy prepare:ocr khi phát triển.');
  this.busy=true;
  let worker:Awaited<ReturnType<typeof createWorker>>|undefined;
  try{
   const workerPath=require.resolve('tesseract.js/src/worker-script/node/index.js').replace('app.asar\\','app.asar.unpacked\\').replace('app.asar/','app.asar.unpacked/');
   worker=await createWorker(['vie','eng'],OEM.LSTM_ONLY,{
    workerPath,langPath:this.resourcesDirectory,cacheMethod:'none',gzip:true,
    logger:message=>progress({status:message.status,progress:message.progress})
   });
   await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1'});
   const texts:string[]=[];
   for(let i=0;i<images.length;i++){
    progress({status:'Đang đọc mặt '+(i+1)+'/'+images.length,progress:0});
    const result=await worker.recognize(Buffer.from(images[i]));texts.push(result.data.text);
   }
   progress({status:'Hoàn tất',progress:1});
   return parseIdentityText(texts.join('\n'));
  }finally{try{await worker?.terminate();}finally{this.busy=false;}}
 }
 get isBusy(){return this.busy;}
}

