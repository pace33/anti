export type Entry={id:string;kind:string;studentId:string;date:string;payload:Record<string,any>;createdAt:string;updatedAt:string};
export type SaveEntry=(kind:string,payload:Record<string,any>,studentId?:string,date?:string,id?:string)=>Promise<Entry>;
export type Student=Entry & {payload:{name:string;grade:string;classRoom?:string;school?:string;address?:string;phone?:string;dream?:string;favorite?:string;active?:boolean}};
export const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());
export const kindLabels:Record<string,string>={worksheet:"학습지",mission:"미션",learning:"학습 기록",behavior:"행동 기록",ledger:"쿠폰 기록",inventory:"재고 정산",schedule:"시간표",booking:"예약",role:"부장 역할",note:"상담·약속",preference:"선호도"};
