export type Entry={id:string;kind:string;studentId:string;date:string;payload:Record<string,any>;createdAt:string;updatedAt:string};
export type SaveEntry=(kind:string,payload:Record<string,any>,studentId?:string,date?:string,id?:string)=>Promise<Entry>;
export type Student=Entry & {payload:{name:string;grade:string;classRoom?:string;school?:string;address?:string;phone?:string;dream?:string;favorite?:string;active?:boolean}};
export const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());
