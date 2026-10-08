export function localDate():string {
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
export function validDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const [y,m,d]=value.split('-').map(Number);
 if(y<1900 || y>2200) return false;
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d;
}
export function requireDate(value:string,label='Ngày'):string {
 if(!validDate(value)) throw new Error(label+' không hợp lệ.');
 return value;
}

