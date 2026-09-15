"use client";
import { createContext,useContext,useId } from "react";
import { Printer,Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from "@/components/ui/select";
import { Entry,SaveEntry,Student } from "@/lib/types";
export const AppContext=createContext<any>(null);
export function useClassroom():{entries:Entry[];students:Student[];selectedStudent:string;setSelectedStudent:(v:string)=>void;save:SaveEntry;remove:(e:Entry)=>void;busy:boolean;navigate:(v:string)=>void}{return useContext(AppContext)}
export function Choice({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{id:string;label:string}[];disabled?:boolean}){const id=useId();return <div className="field"><label htmlFor={id}>{label}</label><Select value={value} onValueChange={v=>onChange(String(v??""))} disabled={disabled}><SelectTrigger id={id} className="control-select"><SelectValue>{options.find(o=>o.id===value)?.label||"선택해 주세요"}</SelectValue></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select></div>}
export function Field({label,...props}:React.ComponentProps<typeof Input>&{label:string}){const id=useId();return <div className="field"><label htmlFor={id}>{label}</label><Input id={id} {...props}/></div>}
export function StudentChoice({optional=true}:{optional?:boolean}){const {students,selectedStudent,setSelectedStudent}=useClassroom();return <Choice label="학생" value={selectedStudent||"__common__"} onChange={v=>setSelectedStudent(v==="__common__"?"":v)} options={[{id:"__common__",label:optional?"이름 없이 만들기":"학생 선택"},...students.map(s=>({id:s.id,label:s.payload.name+(s.payload.grade?" · "+s.payload.grade+"학년":"")}))]}/>}
export function PrintButton(){return <Button variant="outline" onClick={()=>window.print()}><Printer size={16}/>인쇄 / PDF</Button>}
export function RemoveButton({entry}:{entry:Entry}){const {remove}=useClassroom();return <Button variant="ghost" aria-label="기록 삭제" title="기록 삭제" onClick={()=>remove(entry)}><Trash2 size={15}/></Button>}
export function Empty({title,children}:{title:string;children?:React.ReactNode}){return <div className="empty-state"><h3>{title}</h3><p>{children}</p></div>}
