import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const directory=resolve('resources/ocr');await mkdir(directory,{recursive:true});
const manifest={format:'Tesseract LSTM',languages:{}};
for(const language of ['vie','eng']){
 const filename=resolve(directory,language+'.traineddata.gz');let bytes;
 try{bytes=await readFile(filename);if(gunzipSync(bytes).length<100000)throw Error('invalid');}
 catch{
  const url='https://cdn.jsdelivr.net/npm/@tesseract.js-data/'+language+'@1.0.0/4.0.0_best_int/'+language+'.traineddata.gz';
  console.log('Đóng gói mô hình OCR: '+language);
  const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('Không tải được mô hình '+language+': '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(gunzipSync(bytes).length<100000)throw Error('Mô hình OCR không hợp lệ.');
  await writeFile(filename,bytes);
 }
 manifest.languages[language]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:'@tesseract.js-data/'+language+'@1.0.0'};
}
await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('OCR offline đã sẵn sàng: vie + eng.');

