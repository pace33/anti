import mathBank from "@/data/math-bank.json";
import koreanBank from "@/data/korean-bank.json";
export type Settings={subject:string;type:string;level:number;count:number;carry:string;remainder:boolean;table:number;bank:string;layout:string;title?:string;custom?:string};
export type Problem={text:string;answer?:string;a?:number;b?:number;op?:string;kind?:string;meta?:any};
export const defaultSettings:Settings={subject:"korean",type:"syllables",level:1,count:10,carry:"any",remainder:false,table:0,bank:"no-batchim-2",layout:"horizontal"};
export const mathCategories=mathBank.categories;
export const koreanCategories=koreanBank.categories;
export const types:Record<string,{id:string;label:string}[]>={math:[{id:"add",label:"덧셈"},{id:"subtract",label:"뺄셈"},{id:"multiply",label:"곱셈·구구단"},{id:"divide",label:"나눗셈"},{id:"number",label:"수 읽기·쓰기"},{id:"fractions",label:"분수"},{id:"decimal",label:"소수의 덧셈·뺄셈"},{id:"time",label:"시계 읽기"},{id:"word",label:"문장형 문제"}],korean:[{id:"syllables",label:"음절·낱말 읽기"},{id:"hangul",label:"자모음표"},{id:"double",label:"이중모음표"},{id:"batchim",label:"받침 자모음표"},{id:"reading",label:"글 읽고 이해하기"},{id:"writing",label:"생각을 글로 쓰기"},{id:"dictation",label:"받아쓰기"},{id:"copy",label:"단어·문장 따라쓰기"}],english:[{id:"alphabet",label:"알파벳 대문자 쓰기"}],life:[{id:"money",label:"화폐 세기"},{id:"intro",label:"나를 소개해요"},{id:"request",label:"놀이·간식 신청서"},{id:"measure",label:"측정하고 기록하기"}]};
export function randomInt(min:number,max:number,rng=Math.random){return Math.floor(rng()*(max-min+1))+min}
export function shuffle<T>(items:T[],rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){let j=randomInt(0,i,rng);[a[i],a[j]]=[a[j],a[i]]}return a}
export function sampleUnique(items:string[],count:number,rng=Math.random){return shuffle([...new Set(items.map(v=>v.trim()).filter(Boolean))],rng).slice(0,count)}
export function hasCarry(a:number,b:number,sub=false){while(a||b){if(sub?a%10<b%10:a%10+b%10>=10)return true;a=Math.floor(a/10);b=Math.floor(b/10)}return false}
export function readNumber(n:number):string{if(n===0)return "영";const nums=["","일","이","삼","사","오","육","칠","팔","구"],units=["","십","백","천"];let out="",group=0;while(n>0){let k=n%10000,s="";for(let i=0;i<4;i++){let d=Math.floor(k/(10**i))%10;if(d)s=(d===1&&i>0?"":nums[d])+units[i]+s}if(s)out=(group===1&&s==="일"?"":s)+["","만","억","조","경"][group]+out;n=Math.floor(n/10000);group++}return out}
export function generate(s:Settings,rng=Math.random):Problem[]{if(!Number.isInteger(s.count)||s.count<1||s.count>30)throw Error("문항 수는 1~30개로 설정해 주세요.");if(!Number.isInteger(s.level)||s.level<1||s.level>4)throw Error("학습 수준을 확인해 주세요.");const rnd=(a:number,b:number)=>randomInt(a,b,rng),max=10**Math.min(s.level,3)-1,min=s.level===1?1:10**(Math.min(s.level,3)-1);
 if(s.type==="word"){const bank=mathCategories.find(c=>c.id===s.bank)||mathCategories[0];return sampleUnique(bank.questions,s.count,rng).map(text=>({text,kind:"word"}))}
 if(s.type==="syllables"){const bank=koreanCategories.find(c=>c.id===s.bank)||koreanCategories[0];return sampleUnique(bank.items,s.count,rng).map(text=>({text,kind:"copy"}))}
 if(s.type==="copy"){const items=(s.custom||"운동화\n원숭이\n원숭이가 운동화를 신었어요.").split("\n").filter(Boolean);return items.map(text=>({text,kind:"copy"}))}
 if(s.type==="alphabet")return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(text=>({text,kind:"copy"}));
 if(s.type==="hangul"||s.type==="double"||s.type==="batchim"){const initial=[0,2,3,5,6,7,9,11,12,14,15,16,17,18],medial=s.type==="double"?[1,5,3,7,20,16,11,14,9,15,10]:[0,2,4,6,8,12,13,17,18,20],final=s.type==="batchim"?[1,4,7,8,16,17,19,21,22,23,24,25,26,27][Math.max(0,Math.min(13,s.table||0))]:0;return initial.map(ch=>({text:medial.map(v=>String.fromCodePoint(0xAC00+(ch*21+v)*28+final)).join(" "),kind:"hangul"}))}
 if(s.type==="dictation")return Array.from({length:s.count},()=>({text:"",kind:"dictation"}));
 if(s.type==="intro")return ["내 이름","우리 학교","학년과 반","우리 집","보호자 연락처","좋아하는 음식","잘하는 것","내 꿈","선생님께 하고 싶은 말"].map(text=>({text,kind:"intro"}));
 if(s.type==="request")return [{text:s.custom||"저는 컴퓨터를 하고 싶어요.",kind:"copy"},{text:"하고 싶은 활동 / 먹고 싶은 간식",kind:"dictation"},{text:"필요한 쿠폰",kind:"dictation"},{text:"사용 시간과 지킬 약속",kind:"dictation"}];
 if(s.type==="measure")return ["길이를 잴 물건","예상한 길이 (cm)","실제로 잰 길이 (cm)","둘레 (cm)","비교하고 알게 된 점"].map(text=>({text,kind:"dictation"}));
 const questions:Problem[]=[];for(let i=0;i<s.count;i++){let a=0,b=0,op="+",answer="",kind="equation";
 switch(s.type){case "add":case "subtract":{let sub=s.type==="subtract";if(sub&&s.level===1&&s.carry==="yes")throw Error("받아내림은 두 자리부터 선택해 주세요.");let found=false;for(let k=0;k<1500;k++){a=rnd(min,max);b=rnd(1,max);if(sub&&b>a)[a,b]=[b,a];let carries=hasCarry(a,b,sub);if(s.carry==="any"||carries===(s.carry==="yes")){found=true;break}}if(!found)throw Error("출제 조건에 맞는 문제를 만들지 못했습니다. 다시 만들어 주세요.");op=sub?"−":"+";answer=String(sub?a-b:a+b);break}
 case "multiply":a=s.table||rnd(min,max);b=s.table?rnd(2,9):rnd(2,s.level>=3?99:9);op="×";answer=String(a*b);break;
 case "divide":b=rnd(2,s.level>=3?30:9);let q=rnd(2,s.level===1?9:30);let r=s.remainder?rnd(1,b-1):0;a=b*q+r;op="÷";answer=String(q)+(r?" 나머지 "+r:"");break;
 case "number":a=rnd(s.level===1?0:s.level===4?10000:min,s.level===4?999999999:max);answer=readNumber(a);kind="number";break;
 case "fractions":b=rnd(2,12);a=rnd(1,s.remainder?b*2:b-1);kind="fraction";answer=a>=b?"가분수":"진분수";break;
 case "decimal":a=rnd(1,99);b=rnd(1,99);if(s.carry==="no"&&a<b)[a,b]=[b,a];op=s.carry==="no"?"−":"+";answer=((op==="+"?a+b:a-b)/10).toFixed(1);a/=10;b/=10;break;
 case "time":a=rnd(1,12);b=s.level===1?rnd(0,1)*30:rnd(0,59);kind="clock";answer=a+"시 "+b+"분";break;
 case "money":a=rnd(1,9);b=rnd(1,9);kind="money";answer=(a*10000+b*1000).toLocaleString("ko-KR")+"원";break;
 default:a=rnd(1,9);b=rnd(1,9);answer=String(a+b);
 }questions.push({text:kind==="number"?a.toLocaleString("ko-KR"):a+" "+op+" "+b+" =",a,b,op,answer,kind})}return questions}
