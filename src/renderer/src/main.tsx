import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}> {
 state={error:false};
 static getDerivedStateFromError(){return {error:true};}
 render(){return this.state.error?<div className="startup-error"><h1>Không hiển thị được ứng dụng</h1><p>Dữ liệu đã lưu vẫn được giữ trên máy tính. Hãy tải lại để tiếp tục.</p><button onClick={()=>window.location.reload()}>Tải lại ứng dụng</button></div>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
