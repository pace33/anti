import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarDays,RefreshCw} from 'lucide-react';
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

const isTimetable=new URLSearchParams(window.location.search).get('view')==='timetable';
document.title=isTimetable?'학급 시간표':'에이두 수업 공방';
function Home(){
    const [entries,setEntries]=useState<Entry[]>([]),[students,setStudents]=useState<Entry[]>([]);
    const [selectedStudent,setSelectedStudent]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[deleting,setDeleting]=useState<Entry|null>(null);
    const service=useRef<any>(null),mounted=useRef(true),saving=useRef(false);
    async function load(){
        setLoading(true); setError('');
        try{
            if(window.parent===window) throw Error(isTimetable?'에이두 한글 학급 관리에서 시간표를 열어 주세요.':'에이두 한글의 연구실에서 수업 공방을 열어 주세요.');
            service.current ||= (window.parent as any)[isTimetable?'aiedueTimetableSession':'aiedueWorkshopSession'];
            if(!service.current) throw Error('교사 계정으로 로그인한 뒤 다시 열어 주세요.');
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
    const close=()=>service.current?.exit();
    return <AppContext.Provider value={{entries,students,selectedStudent,setSelectedStudent,save,remove:setDeleting,busy:busy||loading||!!error}}>
        <div className={isTimetable?'workshop-app timetable-app':'workshop-app'}>
            <main className="app-main">
                {!isTimetable&&<header className="topbar no-print"><div className="workshop-brand"><button type="button" className="workshop-home" onClick={close} aria-label="에이두 한글"><img src="../aiedu_hangul_logo.webp" alt="에이두 한글"/></button><span>에이두 수업 공방</span></div></header>}
                <div className="workspace">{isTimetable&&<div className="page-heading no-print"><div><h1>시간표</h1><p>우리 반 학생의 요일별 수업을 배치하고 시간표를 인쇄해요.</p></div><CalendarDays size={32}/></div>}
                    {error&&<div role="alert" className="error-banner no-print">{error}<Button variant="outline" onClick={load}><RefreshCw size={16}/>다시 불러오기</Button></div>}
                    {isTimetable?<Timetable/>:<Worksheet/>}
                </div>
            </main>
        </div>
        <AlertDialog open={!!deleting} onOpenChange={v=>!v&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 기록을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>선택한 기록이 목록에서 사라집니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={confirmDelete}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster/>
    </AppContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Home/>);
