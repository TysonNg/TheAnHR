import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export type Notify = (message: string, error?: boolean) => void;
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
export function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function matches(value: string, query: string) { const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi'); return normalize(value).includes(normalize(query.trim())); }
export function useTask(notify: Notify) {
 const [busy, setBusy] = useState(false); const lock = useRef(false);
 const run = async (task: () => Promise<void>) => { if(lock.current) return; lock.current = true; setBusy(true); try { await task(); } catch(e) { notify(messageOf(e),true); } finally { lock.current = false; setBusy(false); } };
 return {busy,run};
}
export function useResource<T>(fetcher: () => Promise<T>, notify: Notify, dependencies: unknown[] = []) {
 const [data,setData] = useState<T>(); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [revision,setRevision] = useState(0);
 const reload = useCallback(() => setRevision(v=>v+1),[]);
 useEffect(() => { let active = true; setLoading(true); setError(''); fetcher().then(value=>{if(active) setData(value);}).catch(e=>{if(active) {setData(undefined);setError(messageOf(e));notify(messageOf(e),true);}}).finally(()=>{if(active) setLoading(false);}); return () => {active=false;}; },[...dependencies,revision]);
 return {data,loading,error,reload};
}
export function Field({label,...props}: React.InputHTMLAttributes<HTMLInputElement> & {label:string}) {const id=useId(); return <label className="field" htmlFor={id}><span>{label}</span><input id={id} {...props}/></label>;}
export function TextArea({label,...props}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {label:string}) { const id=useId(); return <label className="field" htmlFor={id}><span>{label}</span><textarea id={id} rows={3} {...props}/></label>; }
export function Select({label,children,...props}: React.SelectHTMLAttributes<HTMLSelectElement> & {label:string}) {const id=useId();return <label className="field" htmlFor={id}><span>{label}</span><select id={id} {...props}>{children}</select></label>;}
export function Empty({title,children}: {title:string;children:React.ReactNode}) {return <div className="empty"><div className="empty-mark" aria-hidden="true">＋</div><h3>{title}</h3><p>{children}</p></div>;}
export function LoadState({loading,error,retry}: {loading:boolean;error:string;retry:()=>void}) {return loading ? <p role="status" className="muted">Đang tải dữ liệu…</p> : error ? <div className="notice error" role="alert">{error} <button onClick={retry}>Thử lại</button></div> : null;}
export function Modal({title,children,onClose,busy=false,wide=false}: {title:string;children:React.ReactNode;onClose:()=>void;busy?:boolean;wide?:boolean}) {
 const ref=useRef<HTMLDivElement>(null); const titleId=useId(); const close=useRef(onClose); close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null; const node=ref.current!; const backdrop=node.parentElement!;const siblings=Array.from(document.body.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==backdrop&&!el.classList.contains('toast-stack')).map(el=>({el,inert:el.inert,hidden:el.getAttribute('aria-hidden')}));siblings.forEach(({el})=>{el.inert=true;el.setAttribute('aria-hidden','true');});const focusable=()=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el=>!el.closest('[hidden]'));
 (focusable().find(el=>el.tagName==='INPUT') || focusable()[0] || node).focus();
 const handle=(e:KeyboardEvent)=>{ if (e.key==='Escape') {e.preventDefault();e.stopPropagation(); if(!node.dataset.busy || node.dataset.busy==='false') close.current();} if(e.key==='Tab') {const items=focusable();const first=items[0], last=items.at(-1);if(!first){e.preventDefault();node.focus();}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===node)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 node.addEventListener('keydown',handle); return ()=>{node.removeEventListener('keydown',handle);siblings.forEach(({el,inert,hidden})=>{el.inert=inert;if(hidden===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',hidden);});previous?.focus();}; },[]);
 return createPortal(<div className="modal-backdrop"><div className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1} data-busy={busy}><header className="modal-head"><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={`Đóng ${title}`}>×</button></header>{children}</div></div>,document.body);
}
export function Confirm({title,children,action,onConfirm,onClose,busy}: {title:string;children:React.ReactNode;action:string;onConfirm:()=>void;onClose:()=>void;busy:boolean}) {return <Modal title={title} onClose={onClose} busy={busy}><div className="modal-body">{children}</div><footer className="actions"><button onClick={onClose} disabled={busy}>Hủy</button><button className="primary" onClick={onConfirm} disabled={busy}>{busy?'Đang xử lý…':action}</button></footer></Modal>;}
