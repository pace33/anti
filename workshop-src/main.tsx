import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BookOpen,CalendarDays,ClipboardList,Coins,FileText,Sparkles,Users,ArrowLeft,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Toaster} from '@/components/ui/toast';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {AppContext,Empty} from '@/components/classroom/shared';
import Worksheet from '@/components/classroom/worksheet';
import {Missions,Records} from '@/components/classroom/teaching';
import {Economy,Operations} from '@/components/classroom/operations';
import {Entry,SaveEntry,today} from '@/lib/types';
import {toast} from '@/lib/notify';
import './app/globals.css';
import './workshop.css';

const menu=[
    {id:'worksheet',icon:FileText,label:'학습지 만들기',hint:'한글 읽기부터 생각 쓰기까지, 아이에게 맞는 한 장을 준비해요.'},
    {id:'mission',icon:Sparkles,label:'오늘의 미션',hint:'작은 목표와 약속한 보상을 눈에 보이게 정리해요.'},
    {id:'records',icon:ClipboardList,label:'학습·행동 기록',hint:'오답 글자와 관찰한 행동을 기록하며 변화를 살펴봐요.'},
    {id:'economy',icon:Coins,label:'교실 쿠폰·재고',hint:'교실 활동 쿠폰을 인쇄하고 지급·사용 내역을 기록해요.'},
    {id:'operations',icon:CalendarDays,label:'학급 운영',hint:'시간표, 기기 예약, 역할과 상담 메모를 한곳에 모아요.'},
    {id:'students',icon:Users,label:'우리 반 학생',hint:'에이두 한글 학급 관리에 등록된 학생과 함께 사용해요.'}
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
                <p className="nav-caption">오늘의 수업을 준비해요</p>
                <nav aria-label="수업 공방 메뉴">{menu.map(({id,icon:Icon,label})=><button key={id} aria-current={id===active?'page':undefined} onClick={()=>navigate(id)}><Icon size={21}/>{label}</button>)}</nav>
                <div className="workshop-note"><BookOpen size={24}/><strong>작은 배움, 한 장부터</strong><p>읽고, 쓰고, 해내는 경험을<br/>우리 반 속도에 맞춰 주세요.</p></div>
                <button className="workshop-back" onClick={close}><ArrowLeft size={18}/>연구실로 돌아가기</button>
            </aside>
            <main className="app-main"><header className="topbar no-print"><span>에이두 연구실 / <strong>{current.label}</strong></span><span>{loading?'자료 불러오는 중':`${students.length}명의 학생`}</span></header>
                <div className="workspace"><div className="page-heading no-print"><div><p className="eyebrow">AIEDUE TEACHER STUDIO</p><h1>{current.label}</h1><p>{current.hint}</p></div><current.icon size={32}/></div>
                    {error&&<div role="alert" className="error-banner no-print">{error}<Button variant="outline" onClick={load}><RefreshCw size={16}/>다시 불러오기</Button></div>}
                    {active==='worksheet'?<Worksheet/>:active==='mission'?<Missions/>:active==='records'?<Records/>:active==='economy'?<Economy/>:active==='operations'?<Operations/>:<section className="panel"><div className="section-heading"><h2>우리 반 학생</h2><div className="actions"><Button variant="outline" disabled={loading} onClick={load}>새로고침</Button><Button onClick={()=>service.current?.manageClass()}>학급 관리 열기</Button></div></div><p className="muted">학생 추가와 정보 수정은 에이두 한글 학급 관리에서 할 수 있어요.</p>{students.length?<div className="student-grid">{students.map(s=><article className="student-card" key={s.id}><div className="student-avatar">{s.payload.name.slice(0,1)}</div><h3>{s.payload.name}</h3><p>{s.payload.grade?`${s.payload.grade}학년`:'우리 반 학생'}</p><Button variant="outline" onClick={()=>{setSelectedStudent(s.id);navigate('worksheet')}}>학습지 만들기</Button></article>)}</div>:<Empty title="등록된 학생이 없습니다">학급 관리에서 학생을 추가하거나, 이름 없이 공통 학습지를 만들어 보세요.</Empty>}</section>}
                </div>
            </main>
        </div>
        <AlertDialog open={!!deleting} onOpenChange={v=>!v&&setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 기록을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>선택한 기록이 목록에서 사라집니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={confirmDelete}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster/>
    </AppContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Home/>);
