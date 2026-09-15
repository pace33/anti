import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarDays,FileText,ArrowLeft,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Toaster} from '@/components/ui/toast';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {AppContext} from '@/components/classroom/shared';
import Worksheet from '@/components/classroom/worksheet';
import Timetable from '@/components/classroom/timetable';
import {Entry,SaveEntry,today} from '@/lib/types';
import {toast} from '@/lib/notify';
import './app/globals.css';
import './workshop.css';

const menu=[
    {id:'worksheet',icon:FileText,label:'학습지 만들기',hint:'한글 읽기부터 생각 쓰기까지, 아이에게 맞는 한 장을 준비해요.'},
    {id:'timetable',icon:CalendarDays,label:'시간표',hint:'우리 반 학생의 요일별 수업을 배치하고 시간표를 인쇄해요.'}
];
function Home(){
    const [active,setActive]=useState('worksheet'),[entries,setEntries]=useState<Entry[]>([]),[students,setStudents]=useState<Entry[]>([]);
    const [selectedStudent,setSelectedStudent]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[deleting,setDeleting]=useState<Entry|null>(null);
    const service=useRef<any>(null),mounted=useRef(true),saving=useRef(false);
    async function load(){
        setLoading(true); setError('');
        try{
            if(window.parent===window) throw Error('에이두 한글의 연구실에서 수업 공방을 열어 주세요.');
            service.current ||= (window.parent as any).aiedueWorkshopSession;
            if(!service.current) throw Error('교사 계정으로 로그인한 뒤 연구실에서 다시 열어 주세요.');
            const result=await service.current.load();
            if(mounted.current){setEntries(result.entries);setStudents(result.students);setSelectedStudent(id=>result.students.some((s:Entry)=>s.id===id)?id:'');}
        }catch(e:any){if(mounted.current)setError(e.message||'자료를 불러오지 못했습니다.');}
        finally{if(mounted.current)setLoading(false);}
    }
    useEffect(()=>{load();return()=>{mounted.current=false}},[]);
    const save:SaveEntry=async(kind,payload,studentId='',date=today(),id)=>{
        if(saving.current || loading || error || !service.current) throw Error('자료를 불러온 뒤 다시 시도해 주세요.');
        saving.current=true;setBusy(true);
        try{const entry=await service.current.save(kind,payload,studentId,date,id);if(mounted.current){setEntries(prev=>[entry,...prev.filter(x=>x.id!==entry.id)]);toast.success('저장했습니다.');}return entry;}
        catch(e:any){if(mounted.current)toast.error(e.message||'저장하지 못했습니다.');throw e;}
        finally{saving.current=false;if(mounted.current)setBusy(false);}
    };
    async function confirmDelete(){
        if(!deleting||saving.current)return;
        saving.current=true;setBusy(true);
        try{await service.current.remove(deleting.id);if(mounted.current){setEntries(prev=>prev.filter(e=>e.id!==deleting.id));setDeleting(null);toast.success('기록을 삭제했습니다.');}}
        catch(e:any){if(mounted.current)toast.error(e.message);}
        finally{saving.current=false;if(mounted.current)setBusy(false);}
    }
    const navigate=(id:string)=>{setActive(id);window.scrollTo({top:0,behavior:'instant'});};
    const close=()=>service.current?.exit();
    const current=menu.find(m=>m.id===active)!;
    return <AppContext.Provider value={{entries,students,selectedStudent,setSelectedStudent,save,remove:setDeleting,busy:busy||loading||!!error,navigate}}>
        <div className="workshop-app">
            <aside className="workshop-nav no-print">
                <button className="workshop-brand" onClick={close} aria-label="에이두 한글로 돌아가기"><img src="../aiedu_hangul_logo.webp" alt="에이두 한글"/><span>수업 공방<small>선생님의 수업 준비실</small></span></button>
                <nav aria-label="수업 공방 메뉴">{menu.map(({id,icon:Icon,label})=><button key={id} aria-current={id===active?'page':undefined} onClick={()=>navigate(id)}><Icon size={21}/>{label}</button>)}</nav>
                <button className="workshop-back" onClick={close}><ArrowLeft size={18}/>연구실로 돌아가기</button>
            </aside>
            <main className="app-main"><header className="topbar no-print"><span>에이두 연구실 / <strong>{current.label}</strong></span><span>{loading?'자료 불러오는 중':`${students.length}명의 학생`}</span></header>
                <div className="workspace"><div className="page-heading no-print"><div><p className="eyebrow">AIEDUE TEACHER STUDIO</p><h1>{current.label}</h1><p>{current.hint}</p></div><current.icon size={32}/></div>
                    {error&&<div role="alert" className="error-banner no-print">{error}<Button variant="outline" onClick={load}><RefreshCw size={16}/>다시 불러오기</Button></div>}
                    {active==='worksheet'?<Worksheet/>:<Timetable/>}
                </div>
            </main>
        </div>
        <AlertDialog open={!!deleting} onOpenChange={v=>!v&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 기록을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>선택한 기록이 목록에서 사라집니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={confirmDelete}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster/>
    </AppContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Home/>);
