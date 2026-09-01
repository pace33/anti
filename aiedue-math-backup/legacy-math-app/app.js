const domains=[
{id:'number',title:'수와 연산',icon:'🔢',color:'#53b8e9',idea:'사물의 양을 수로 표현하고, 연산의 의미와 원리를 생활 문제에 활용해요.'},
{id:'change',title:'변화와 관계',icon:'🔁',color:'#9c8bea',idea:'규칙과 두 양의 관계를 찾아 말, 표, 수, 식으로 나타내요.'},
{id:'shape',title:'도형과 측정',icon:'📐',color:'#69c58f',idea:'도형의 성질을 탐구하고 여러 가지 양을 비교하고 측정해요.'},
{id:'data',title:'자료와 가능성',icon:'📊',color:'#ff9c79',idea:'자료를 수집·정리·해석하고 근거를 바탕으로 판단해요.'}
];

const nodes={
number:{
'1-2':[
{id:'count-20',title:'20 이하의 수',desc:'하나씩 대응하여 세고 수를 읽고 써요.'},
{id:'compose',title:'수의 분해와 합성',desc:'하나의 수를 두 수로 나누고 다시 합쳐요.'},
{id:'make-10',title:'10 만들기',desc:'합이 10이 되는 두 수의 관계를 익혀요.'},
{id:'add-sub-1',title:'한 자리 수 덧셈과 뺄셈',desc:'합치기와 덜어내기를 식으로 나타내요.'},
{id:'place-value',title:'두 자리 수의 자릿값',desc:'10개씩 묶어 십과 일을 이해해요.'},
{id:'add-sub-2',title:'두 자리 수 덧셈과 뺄셈',desc:'묶음과 낱개를 이동하며 계산 원리를 익혀요.'}],
'3-4':[
{id:'big-number',title:'큰 수와 자릿값',desc:'만 이상의 수를 읽고 크기를 비교해요.'},
{id:'multiply-divide',title:'곱셈과 나눗셈',desc:'묶기와 나누기를 연결하고 몫과 나머지를 이해해요.'},
{id:'fraction-intro',title:'분수의 의미',desc:'전체를 똑같이 나누어 부분을 표현해요.'},
{id:'decimal-intro',title:'소수의 의미',desc:'분모가 10인 분수와 소수를 연결해요.'}],
'5-6':[
{id:'factor-multiple',title:'약수와 배수',desc:'수의 구조를 탐구하고 분수 계산에 연결해요.'},
{id:'fraction-op',title:'분수의 계산',desc:'통분의 필요성을 이해하고 사칙계산을 해요.'},
{id:'decimal-op',title:'소수의 계산',desc:'자릿값 원리를 바탕으로 곱셈과 나눗셈을 해요.'},
{id:'estimate',title:'어림과 혼합 계산',desc:'계산 결과를 예측하고 타당성을 판단해요.'}]},
change:{'1-2':[{id:'repeat-pattern',title:'반복 규칙',desc:'색, 모양, 수의 반복 규칙을 찾아요.'},{id:'make-pattern',title:'나만의 규칙',desc:'규칙을 만들고 말과 그림으로 설명해요.'}], '3-4':[{id:'change-pattern',title:'변화 규칙',desc:'증가하고 감소하는 규칙을 수와 식으로 표현해요.'},{id:'equality',title:'등호와 동치',desc:'등호 양쪽의 양이 같다는 뜻을 이해해요.'}], '5-6':[{id:'correspondence',title:'대응 관계',desc:'두 양의 관계를 표와 식으로 나타내요.'},{id:'ratio',title:'비와 비율',desc:'두 양을 비교하고 분수·소수·백분율로 나타내요.'},{id:'proportion',title:'비례식과 비례배분',desc:'비례 관계를 활용해 생활 문제를 해결해요.'}]},
shape:{'1-2':[{id:'solid-shape',title:'생활 속 입체 모양',desc:'직육면체, 원기둥, 구 모양을 찾아요.'},{id:'plane-shape',title:'삼각형·사각형·원',desc:'모양의 공통점을 찾고 직접 만들어요.'},{id:'compare',title:'양의 비교',desc:'길이, 들이, 무게, 넓이를 비교해요.'},{id:'length-time',title:'길이와 시간',desc:'cm, m와 시, 분을 생활 속에서 사용해요.'}], '3-4':[{id:'polygon',title:'삼각형·사각형·다각형',desc:'구성 요소와 성질에 따라 분류해요.'},{id:'move-shape',title:'도형의 이동',desc:'밀기, 뒤집기, 돌리기 결과를 추측해요.'},{id:'measure-unit',title:'여러 가지 측정 단위',desc:'mm, km, L, mL, kg, g, t를 사용해요.'},{id:'angle',title:'각도',desc:'각의 크기를 비교하고 각도기로 재요.'}], '5-6':[{id:'symmetry',title:'합동과 대칭',desc:'겹침과 대칭을 통해 도형의 관계를 탐구해요.'},{id:'solid-property',title:'입체도형의 성질',desc:'각기둥, 각뿔, 원기둥, 원뿔, 구를 탐구해요.'},{id:'area',title:'둘레와 넓이',desc:'공식이 만들어지는 과정을 이해해요.'},{id:'volume',title:'겉넓이와 부피',desc:'단위 정육면체와 전개도로 측정 원리를 익혀요.'}]},
data:{'1-2':[{id:'classify',title:'분류하기',desc:'분명한 기준을 정해 자료를 나누어요.'},{id:'simple-chart',title:'표와 간단한 그래프',desc:'개수를 표와 기호 그래프로 나타내요.'}], '3-4':[{id:'picture-chart',title:'그림그래프',desc:'그림 한 개가 나타내는 수를 이해해요.'},{id:'bar-chart',title:'막대그래프',desc:'자료의 크기를 한눈에 비교해요.'},{id:'line-chart',title:'꺾은선그래프',desc:'시간에 따른 변화를 읽고 설명해요.'}], '5-6':[{id:'average',title:'평균',desc:'자료를 하나의 값으로 대표하고 의미를 해석해요.'},{id:'ratio-chart',title:'띠그래프와 원그래프',desc:'전체에 대한 각 부분의 비율을 나타내요.'},{id:'chance',title:'가능성',desc:'사건이 일어날 가능성을 비교하고 표현해요.'}]}
};

const state={domain:'number',band:'1-2',lesson:null,step:0,selected:null,progress:JSON.parse(localStorage.getItem('aieduMathProgress')||'{}')};
const screens=[...document.querySelectorAll('.screen')];
const steps=['경험하기','조작하기','시각화하기','기호화하기','설명하기','적용하기'];

function show(id){screens.forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
function allNodes(){return Object.values(nodes).flatMap(b=>Object.values(b).flat());}
function completed(id){return !!state.progress[id];}
function save(){localStorage.setItem('aieduMathProgress',JSON.stringify(state.progress));renderSummary();}
function renderSummary(){const total=allNodes().length;const done=Object.keys(state.progress).filter(k=>state.progress[k]).length;const percent=Math.round(done/total*100);document.querySelector('#totalProgress').style.width=percent+'%';document.querySelector('#totalProgressText').textContent=percent+'%';document.querySelector('#stars').textContent=done*3;}
function domainProgress(domain){const list=Object.values(nodes[domain]).flat();return Math.round(list.filter(n=>completed(n.id)).length/list.length*100);}
function renderDashboard(){const grid=document.querySelector('#domainGrid');grid.innerHTML=domains.map(d=>`<button class="domain-card" data-domain="${d.id}" style="--accent:${d.color}"><span class="icon">${d.icon}</span><h3>${d.title}</h3><p>${d.idea}</p><div class="mini-progress" aria-label="${domainProgress(d.id)}% 완료"><span style="width:${domainProgress(d.id)}%"></span></div></button>`).join('');}
function openDomain(id){state.domain=id;const d=domains.find(x=>x.id===id);const header=document.querySelector('#domainHeader');header.style.setProperty('--accent',d.color);header.innerHTML=`<p class="eyebrow">핵심 아이디어 중심 배움</p><h1 id="domainTitle">${d.icon} ${d.title}</h1><p>${d.idea}</p>`;renderNodes();show('domainScreen');}
function renderNodes(){document.querySelectorAll('.grade-tab').forEach(b=>{const active=b.dataset.band===state.band;b.classList.toggle('active',active);b.setAttribute('aria-selected',active)});const list=nodes[state.domain][state.band];document.querySelector('#nodePath').innerHTML=list.map((n,i)=>{const isDone=completed(n.id);const prevDone=i===0||completed(list[i-1].id);return `<article class="node-card ${prevDone?'':'locked'}"><div class="node-index">${isDone?'✓':i+1}</div><div><h3>${n.title}</h3><p>${n.desc}</p></div>${prevDone?`<button class="ghost" data-node="${n.id}">${isDone?'다시 배우기':'시작하기'}</button>`:'<span class="node-status">🔒 앞 개념 먼저</span>'}</article>`}).join('');}

function openLesson(id){const found=allNodes().find(n=>n.id===id)||{id,title:'개념 학습',desc:''};state.lesson=found;state.step=0;state.selected=null;document.querySelector('#lessonTitle').textContent=found.title;document.querySelector('#lessonDomain').textContent=domains.find(d=>d.id===state.domain)?.title||'수와 연산';renderLesson();show('lessonScreen');}
function renderStepList(){document.querySelector('#stepList').innerHTML=steps.map((s,i)=>`<li class="${i===state.step?'active':''} ${i<state.step?'done':''}">${i+1}. ${s}</li>`).join('');}
function makeTenStage(){const a=[7,6,8,4,5,9][state.step%6],answer=10-a;const dots=Array.from({length:10},(_,i)=>`<div class="cell ${i<a?'filled':''}">${i<a?'●':''}</div>`).join('');const choices=[answer,(answer+2)%10,Math.max(0,answer-1)].sort(()=>Math.random()-.5);return `<div class="problem"><p class="eyebrow">${steps[state.step]}</p><h2>${a}에 얼마를 더하면 10이 될까요?</h2><div class="ten-frame">${dots}</div><div class="choice-grid">${choices.map(v=>`<button class="choice" data-value="${v}">${v}</button>`).join('')}</div></div>`;}
function genericStage(){return `<div class="problem"><p class="eyebrow">${steps[state.step]}</p><h2>${state.lesson.title}</h2><p>${state.lesson.desc}</p><div class="choice-grid"><button class="choice" data-value="1">①</button><button class="choice" data-value="2">②</button><button class="choice" data-value="3">③</button></div><p>현재 MVP에서는 ‘10 만들기’ 활동이 완전 구현되어 있으며, 다른 개념은 화면 구조를 확인할 수 있어요.</p></div>`;}
function renderLesson(){renderStepList();document.querySelector('#lessonStage').innerHTML=state.lesson.id==='make-10'?makeTenStage():genericStage();document.querySelector('#feedback').textContent='';document.querySelector('#feedback').className='feedback';state.selected=null;}
function checkAnswer(){if(state.selected===null){setFeedback('답을 하나 골라 주세요.','try');return;}if(state.lesson.id==='make-10'){const a=[7,6,8,4,5,9][state.step%6];if(Number(state.selected)!==10-a){setFeedback('아직 10이 되지 않아요. 빈칸을 세어 보세요.','try');return;}}setFeedback('잘했어요! 다음 표현으로 연결해 볼까요?','good');setTimeout(()=>{if(state.step<5){state.step++;renderLesson();}else{state.progress[state.lesson.id]=true;save();setFeedback('배움 완료! 이 개념은 다음 학습에서 다시 만나요.','good');document.querySelector('#checkBtn').textContent='배움 지도 보기';document.querySelector('#checkBtn').onclick=()=>{document.querySelector('#checkBtn').textContent='확인';document.querySelector('#checkBtn').onclick=checkAnswer;openDomain(state.domain);};}},650);}
function setFeedback(text,type){const f=document.querySelector('#feedback');f.textContent=text;f.className='feedback '+type;}
function speak(){const text=`${state.lesson.title}. ${document.querySelector('#lessonStage h2')?.textContent||''}`;if('speechSynthesis'in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));}}

document.addEventListener('click',e=>{const domain=e.target.closest('[data-domain]');if(domain)openDomain(domain.dataset.domain);const node=e.target.closest('[data-node]');if(node){state.domain=Object.keys(nodes).find(d=>Object.values(nodes[d]).flat().some(n=>n.id===node.dataset.node))||state.domain;openLesson(node.dataset.node);}const choice=e.target.closest('.choice');if(choice){document.querySelectorAll('.choice').forEach(c=>c.classList.remove('selected'));choice.classList.add('selected');state.selected=choice.dataset.value;}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='home'){renderDashboard();show('dashboard');}if(action==='domain')openDomain(state.domain);});
document.querySelectorAll('.grade-tab').forEach(btn=>btn.addEventListener('click',()=>{state.band=btn.dataset.band;renderNodes();}));
document.querySelector('#checkBtn').onclick=checkAnswer;
document.querySelector('#hintBtn').onclick=()=>setFeedback(state.lesson?.id==='make-10'?'노란 점과 빈칸을 모두 합하면 10이에요. 빈칸 개수를 세어 보세요.':'그림이나 구체물을 이용해 다시 생각해 보세요.','try');
document.querySelector('#speakBtn').onclick=speak;
document.querySelector('#resetBtn').onclick=()=>{if(confirm('저장된 학습 진행도를 초기화할까요?')){state.progress={};save();renderDashboard();}};
renderDashboard();renderSummary();