import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Projects from './Projects';
import Employees from './Employees';
import Exports from './Exports';
import Settings from './Settings';
import type { Notify } from './ui';
type Page='Dự án'|'Nhân viên'|'Xuất lý lịch'|'Cấu hình';
const pages:Page[]=['Dự án','Nhân viên','Xuất lý lịch','Cấu hình'];
function NavIcon({index}: {index:number}) {const paths=['M3 5h6l2 3h10v12H3z','M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-3c0-4 16-4 16 0v3','M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6','M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6'];return <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d={paths[index]}/></svg>;}
export default function App() {
 const [page,setPage]=useState<Page>('Dự án');const [revision,setRevision]=useState(0);const [toasts,setToasts]=useState<{id:number;message:string;error:boolean}[]>([]);const nextId=useRef(0);const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 const notify:Notify=useCallback((message,error=false)=>{const id=++nextId.current;setToasts(current=>[...current.slice(-3),{id,message,error}]);timers.current.push(setTimeout(()=>setToasts(current=>current.filter(t=>t.id!==id)),error?12000:7000));},[]);
 useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
 if(!window.thean)return <div className="startup-error"><h1>Không kết nối được dữ liệu</h1><p>Vui lòng mở TheAnHR từ ứng dụng trên máy tính để truy cập hồ sơ.</p><button onClick={()=>window.location.reload()}>Tải lại ứng dụng</button></div>;
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">TA</span><div><strong>THẾ AN</strong><span>Quản lý nhân sự</span></div></div><div className="sidebar-rule"/><p className="nav-caption">KHÔNG GIAN LÀM VIỆC</p><nav aria-label="Điều hướng chính">{pages.map((item,index)=><button key={item} aria-current={page===item?'page':undefined} onClick={()=>setPage(item)}><NavIcon index={index}/>{item}</button>)}</nav><div className="sidebar-bottom"><span className="offline-dot"/><span>Làm việc ngoại tuyến</span><p>Hồ sơ được lưu trên máy tính.</p><span className="sidebar-app-name">TheAnHR</span></div></aside><main key={`${page}-${revision}`} id="main-content">{page==='Dự án'?<Projects notify={notify}/>:page==='Nhân viên'?<Employees notify={notify}/>:page==='Xuất lý lịch'?<Exports notify={notify}/>:<Settings notify={notify} onRestore={()=>setRevision(v=>v+1)}/>}</main>{createPortal(<div className="toast-stack" aria-label="Thông báo">{toasts.map(t=><div key={t.id} className={`toast ${t.error?'error':''}`} role={t.error?'alert':'status'}><span>{t.message}</span><button type="button" aria-label="Đóng thông báo" onClick={()=>setToasts(current=>current.filter(item=>item.id!==t.id))}>×</button></div>)}</div>,document.body)}</div>;
}
