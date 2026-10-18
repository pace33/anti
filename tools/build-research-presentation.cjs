// Rebuild: PPTXGENJS_MODULE=/absolute/path/to/pptxgenjs node tools/build-research-presentation.cjs
const fs=require('node:fs'),path=require('node:path');
const pptxgen=require(process.env.PPTXGENJS_MODULE||'pptxgenjs');
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'research-presentation.json'),'utf8'));
const out=path.resolve(__dirname,'../research-prep'),screens=path.join(out,'screens');
const p=new pptxgen();p.layout='LAYOUT_WIDE';p.author=D.authors;p.title=D.title;p.subject='왜 만들었는지, 실제 화면, 제출 보고서에 근거한 학생의 변화';p.company='에이두';p.lang='ko-KR';
p.theme={headFontFace:'맑은 고딕',bodyFontFace:'맑은 고딕',lang:'ko-KR'};
const C={ink:'233345',gray:'697889',line:'E3E9EF',paper:'FAFBFC',orange:'F37836',green:'4C9E45',pale:'FFF0E5',white:'FFFFFF',blue:'EEF5FA'};
const text=(s,t,x,y,w,h,size=22,color=C.ink,bold=false,extra={})=>s.addText(t,{x,y,w,h,fontFace:'맑은 고딕',fontSize:size,color,bold,margin:0,valign:'mid',...extra});
const rect=(s,x,y,w,h,color)=>s.addShape(p.ShapeType.rect,{x,y,w,h,line:{transparency:100},fill:{color}});
const line=(s,x,y,w,h=0,color=C.line)=>s.addShape(p.ShapeType.line,{x,y,w,h,line:{color,width:1.2}});
const actualSlides=new Set(),usedScreens=new Set();
function image(s,file,x,y,w,h){const f=path.join(screens,file);if(!fs.existsSync(f))throw Error('Missing real screen '+file);const bytes=fs.readFileSync(f);if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Expected original PNG screen');const iw=bytes.readUInt32BE(16),ih=bytes.readUInt32BE(20),scale=Math.min(w/iw,h/ih),dw=iw*scale,dh=ih*scale;s.addImage({path:f,x:x+(w-dw)/2,y:y+(h-dh)/2,w:dw,h:dh});usedScreens.add(file);actualSlides.add(p._slides.indexOf(s)+1);}
function foot(s,d,i){line(s,.55,7.06,12.2);text(s,'근거: 제출보고서 '+d.source,.6,7.15,10.9,.2,9.5,C.gray);text(s,String(i).padStart(2,'0'),12.05,7.12,.6,.27,12,C.gray,false,{align:'right'});}
function base(d,i){const s=p.addSlide();s.background={color:C.paper};text(s,d.eyebrow||'질의응답 참고',.65,.35,11.9,.32,14,C.green,true);text(s,d.title,.65,.96,12.0,.62,30,C.ink,true);foot(s,d,i);return s;}
function caption(s,t,x=.65,y=6.64,w=11.9){text(s,t,x,y,w,.28,11.5,C.gray);}
function label(s,t,x,y,w=2.2,color=C.green){text(s,t,x,y,w,.45,22,color,true);}
let elapsed=0;
D.slides.forEach((d,idx)=>{
 const s=p.addSlide();s.background={color:C.paper};foot(s,d,idx+1);s.addNotes(`[${elapsed}秒 / ${d.seconds}초 배정]\n${d.say}\n\n${D.scope}\n근거: ${d.source}`.replace('秒','초'));elapsed+=d.seconds;
 text(s,d.eyebrow,.65,.35,12,.32,14,C.green,true);
 if(!['cover','ending','why'].includes(d.kind))text(s,d.title,.65,.96,12,.7,30,C.ink,true);
 switch(d.kind){
 case 'cover':
  text(s,'교과는 함께,\n문해 수준은 맞춤으로',.7,1.25,5.0,1.4,33,C.ink,true);
  text(s,'같은 수업에\n함께 들어갈 수 있도록',.75,3.0,4.7,1.35,28,C.green,true);
  image(s,d.image,5.4,1.12,7.5,5.15);
  text(s,D.subtitle,.75,5.82,4.75,.65,14,C.gray);text(s,D.authors,.75,6.58,11.8,.28,14,C.ink);
  break;
 case 'why':
  text(s,'한글을 배워도,\n교과서 앞에서 다시 막힌다면?',.7,1.04,12,1.0,32,C.ink,true);
  image(s,d.image,5.5,2.13,7.2,4.68);
  text(s,'익숙한 낱말에서\n낯선 교과 어휘로',.85,2.72,4.8,1.05,27,C.gray);
  text(s,'고령화\n비생물 요소',.85,4.05,4.2,1.25,34,C.orange,true);
  text(s,'내용을 바꾸기보다,\n접근하는 발판을 바꿉니다.',.85,5.77,4.3,.77,21,C.ink,true);
  break;
 case 'stages':
  image(s,d.image,.35,1.75,8.65,4.8);
  [['맞춤','지금 어려운 것을 고르고'],['이음','오늘의 교과에 이어 쓰고'],['자람','다음 지도를 다시 정합니다']].forEach((a,i)=>{label(s,a[0],9.15,2.15+i*1.3,3);text(s,a[1],9.15,2.7+i*1.3,3.5,.55,20,C.ink);});
  caption(s,'실제 학생 테스트 화면 · 모든 학생이 같은 단계부터 같은 진도로 시작하지 않습니다.');break;
 case 'contrast':
  image(s,d.image,.25,1.8,8.65,4.8);label(s,'S1의 반복 오류',9.2,1.98,3.4,C.gray);text(s,'ㅓ ↔ ㅗ',9.12,2.56,3.5,.75,40,C.orange,true);
  text(s,'고기 → 거기',9.12,3.42,3.5,.55,24,C.ink,true);text(s,'소리를 나누고,\n낱말을 읽고 씁니다.',9.12,4.2,3.6,.83,21,C.ink);
  image(s,d.image2,9.2,5.05,3.55,1.65);caption(s,'현재 기능 시연 화면 · S1의 학생 기록 화면이 아닌 수업 방식 설명입니다.');break;
 case 'import':
  image(s,d.image,.25,2.24,6.45,3.8);image(s,d.image2,6.65,2.24,6.45,3.8);
  text(s,'수업자료에서 찾기',.8,1.78,5,.35,20,C.green,true);text(s,'이번 차시에 필요한 말 고르기',7.13,1.78,5.5,.35,20,C.green,true);
  text(s,'사회 변화 · 저출산 · 고령화 · 지능정보화',.85,6.22,11.7,.45,25,C.ink,true,{align:'center'});caption(s,'보고서의 사회 수업 핵심어 · 사진 화면은 현재 앱의 기본 사용법 체험입니다.',.85,6.76,11.7);break;
 case 'write':
  image(s,d.image,.05,1.7,9.55,4.9);text(s,'보고\n듣고\n직접 쓰고',9.45,2.55,3.15,2.45,31,C.green,true,{breakLine:false});
  text(s,'어려운 말은\n다시 연습합니다.',9.45,5.34,3.2,.85,21,C.ink,true);caption(s,'실제 쓰기판 · ‘나무’는 기본 체험 낱말이며 연구 학생의 수행 결과가 아닙니다.');break;
 case 'meaning':
  image(s,d.image,.0,1.72,9.65,4.88);text(s,'어느 문장을\n보고 골랐나요?',9.5,2.34,3.1,1.6,26,C.green,true);
  text(s,'낱말 → 지문\n→ 교과 활동',9.5,4.57,3.2,1.2,25,C.ink,true);caption(s,'실제 문해력 풀이·해설 화면 · 기본 예시 문제 / 질문 문구는 수업 활용 제안입니다.');break;
 case 'scores':{
  text(s,'한글 해득 진단 평균',.85,2.25,4.5,.5,23,C.gray);text(s,'78 → 93.5',.72,3.1,4.9,1.25,46,C.orange,true);
  text(s,'평균 +15.5점',.85,4.8,4.4,.65,30,C.ink,true);text(s,'한글 또박또박 · 106점 만점\n4명 / 2026.6.1.~7.30.',.85,5.68,4.5,.8,18,C.gray);
  const pre=[77,38,95,102],post=[92,77,102,103];text(s,'사전',5.85,1.94,1,.32,14,C.gray);rect(s,6.7,2.02,.36,.1,'ADB9C4');text(s,'사후',7.45,1.94,1,.32,14,C.orange);rect(s,8.3,2.02,.36,.1,C.orange);
  pre.forEach((v,i)=>{const y=2.63+i*.93;label(s,'S'+(i+1),5.85,y,.8,C.ink);rect(s,6.65,y+.1,4.55*v/106,.15,'ADB9C4');rect(s,6.65,y+.34,4.55*post[i]/106,.21,C.orange);text(s,`${v} → ${post[i]}`,11.33,y+.09,1.5,.4,18,C.ink,true);});
  caption(s,'앱 경험치가 아닌 별도 진단 결과입니다. 비교집단 없는 사전·사후 변화로 해석합니다.');break;}
 case 'participation':
  image(s,d.image,.25,2.02,6.5,4.35);
  [['S1','과제를 시작하고 집중하기','반복적인 도움 감소'],['S2','회피를 줄이고 이어 가기','교사 도움을 받아 완수'],['S3','틀린 부분을 스스로 고치기','독립 수행·자기 수정 관찰'],['S4','어려운 과제도 이어 가기','안정적인 집중 관찰']].forEach((a,i)=>{const y=1.95+i*1.14;label(s,a[0],7.0,y,.7);text(s,a[1],7.85,y,4.75,.46,21,C.ink,true);text(s,a[2],7.85,y+.52,4.75,.37,16,C.gray);});
  caption(s,'변화: 제출보고서의 교사 관찰 / 왼쪽은 현재 기능 예시이며 연구 학생의 수행 사진이 아닙니다.');break;
 case 'teacher':
  image(s,d.image,.15,1.8,8.5,4.8);[['오류 확인','무엇이 어려웠는지'],['내용 선택','다음에 무엇을 연습할지'],['다시 지도','필요한 도움을 조정하기']].forEach((a,i)=>{label(s,a[0],8.95,2.04+i*1.27,3.5);text(s,a[1],8.95,2.57+i*1.27,3.8,.5,20,C.ink);});
  caption(s,'현재 배움 목록 화면 · AI는 자료 생성·채점을 지원하고, 교육적 판단은 교사가 맡습니다.');break;
 case 'limits':
  text(s,'확인한 변화',.85,2.0,5.4,.5,25,C.green,true);text(s,'한글 해득 진단 상승\n참여 모습의 변화',.85,2.96,5.5,1.4,32,C.ink,true);text(s,'4명의 전후 점수와 교사 관찰',.9,4.82,5.1,.7,21,C.gray);
  line(s,6.55,2.0,0,4.2);text(s,'다음에 확인할 변화',7.12,2.0,5.3,.5,25,C.orange,true);text(s,'얼마나 오래 유지될까?\n새로운 과제에도 이어질까?',7.12,2.96,5.3,1.6,29,C.ink,true);text(s,'비교·반복 측정·유지·타 교사 적용',7.17,4.82,5.3,.8,19,C.gray);
  caption(s,'프로그램 단독의 인과 효과나 모든 학생의 같은 성과를 확정하지 않습니다.');break;
 case 'ending':
  text(s,'더 쉬운 다른 수업보다,\n같은 수업에 들어갈 발판을',.75,1.45,6.4,1.9,34,C.ink,true);image(s,d.image,7.0,1.55,5.7,4.2);
  text(s,'맞춤  →  이음  →  자람',.85,4.1,6.35,.65,29,C.green,true);text(s,'교과는 함께, 문해 수준은 맞춤으로',.85,5.25,6.9,.6,23,C.orange,true);text(s,D.authors,.85,6.49,11.5,.3,15,C.gray);break;
 default:throw Error('Unsupported slide '+d.kind);
 }
});
D.appendices.forEach((d,j)=>{const s=base(d,13+j);s.addNotes(d.say+'\n'+D.scope);
 if(d.kind==='detail'){
  [['학생','사전 → 사후 / 106점','해석'],['S1','77 → 92','노력 요함 → 보통'],['S2','38 → 77','노력 요함 유지 · 도움받은 지속'],['S3','95 → 102','잘함 유지 · 자기 수정 관찰'],['S4','102 → 103','잘함 유지 · 새 도달 영역 없음']].forEach((r,i)=>{const y=2.1+i*.77;rect(s,.75,y,11.8,.73,i===0?C.ink:i%2?C.white:'EDF3F6');text(s,r[0],1,y+.12,1,.46,19,i?C.ink:C.white,true);text(s,r[1],2.6,y+.12,3.8,.46,20,i?C.ink:C.white);text(s,r[2],6.65,y+.12,5.65,.46,19,i?C.ink:C.white);});
  caption(s,'평균 원점수 78 → 93.5. 상승 점수·수준 변화·독립 수행은 서로 다른 지표입니다.');
 }else if(d.kind==='scope'){
  text(s,'화면',.85,2.14,2.1,.5,28,C.green,true);text(s,'현재 공개 앱 · 학생 테스트 계정 · 기본 체험\n기능을 설명하는 직접 캡처 / 연구 학생 기록 아님',3.0,2.08,9.1,1.0,23,C.ink);
  text(s,'연구 결과',.85,3.83,2.1,.5,28,C.orange,true);text(s,'2026.6.1.~7.30. / 특수교육대상학생 4명\n제출보고서의 진단·관찰·학생 활동 결과',3.0,3.73,9.1,1.1,23,C.ink);
  text(s,'구분 원칙',.85,5.47,2.1,.5,25,C.gray,true);text(s,'이후 기능의 효과를 소급하지 않음\n원본 HWP·학생 원자료·실명은 공개 자료에 넣지 않음',3.0,5.35,9.1,1.0,21,C.ink);
 }else{
  text(s,'이진구',.85,2.1,2.2,.6,30,C.green,true);text(s,'교육적 기능·수업 설계 / 적용·수집·분석 / 보고서',3.15,2.13,9.1,.65,22,C.ink);
  text(s,'이인호',.85,3.53,2.2,.6,30,C.green,true);text(s,'웹 개발 / OCR·AI·TTS·채점·기록 / 기술 검증·운영',3.15,3.56,9.1,.65,22,C.ink);
  text(s,'근거 찾기',.85,5.05,2.3,.5,26,C.gray,true);text(s,'Ⅰ 필요성 · Ⅱ 구성 · Ⅲ 수업 · Ⅳ 결과 · Ⅴ 결론\n붙임 1 역할 분담(각 50%) · 붙임 2·3 제작과 구성',3.15,4.98,9.1,1.05,21,C.ink);
 }
});
if(elapsed!==600||p._slides.length!==15||actualSlides.size<10)throw Error('Presentation structure mismatch');
const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
let at=0;let script=`# 에이두 한글 · 실화면 중심 10분 발표 대본\n\n${D.title}\n\n${D.authors}\n\n- 본 발표 12장: 배정 시간 합계 10분. 부록 3장은 질의응답용입니다.\n- 실제 낭독 측정값은 아닙니다. 화면을 짚는 멈춤과 전환을 포함해 리허설하세요.\n- 흐름: 왜 만들었나 → 화면에서 어떻게 배우나 → 점수와 참여의 실제 변화 → 다음 지도.\n- ${D.scope}\n\n`;
D.slides.forEach((d,i)=>{script+=`## ${i+1}. ${d.title.replaceAll('\n',' ')}\n\n시간: ${fmt(at)}–${fmt(at+d.seconds)} (${d.seconds}초)\n\n보여줄 화면: ${[d.image,d.image2].filter(Boolean).join(' / ')||'제출보고서 기반 결과·해석 도식'}\n\n${d.say}\n\n근거: 제출보고서 ${d.source}\n\n---\n\n`;at+=d.seconds;});script+='## 질의응답용 부록 (10분에 미포함)\n\n'+D.appendices.map((d,i)=>`### ${13+i}. ${d.title}\n\n${d.say}\n\n근거: ${d.source}`).join('\n\n');
fs.writeFileSync(path.join(out,'presentation-script.md'),script);
const info={title:D.title,version:D.version,mainSlides:12,totalSlides:15,seconds:600,screenSlides:[...actualSlides],screens:[...usedScreens],scope:D.scope,slides:[...D.slides,...D.appendices].map((d,i)=>({title:d.title.replaceAll('\n',' '),seconds:d.seconds||0,image:`slides/slide-${String(i+1).padStart(2,'0')}.jpg`,source:d.source,appendix:i>=12}))};
fs.writeFileSync(path.join(out,'presentation.json'),JSON.stringify(info,null,2)+'\n');
p.writeFile({fileName:path.join(out,'presentation-10min.pptx')}).then(()=>console.log(JSON.stringify({...info,slides:15,speakerNotes:15,scriptCharacters:D.slides.reduce((n,d)=>n+d.say.length,0),output:path.join(out,'presentation-10min.pptx')})));
