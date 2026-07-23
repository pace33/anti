const STORAGE_KEY = 'aieduMathSpiralProgressV2';
const BANDS = ['1-2', '3-4', '5-6'];
const STEPS = ['경험', '조작', '시각화', '기호화', '설명', '적용'];

const CURRICULUM = [
  {
    id: 'number', title: '수와 연산', icon: '🔢', color: '#35a7ff',
    idea: '수의 의미와 연산의 원리를 생활 속 문제 해결에 연결해요.',
    bands: {
      '1-2': [
        lesson('n-count', '20 이하의 수', '하나씩 대응하여 수를 세고 크기를 비교해요.', 'count', ['[2수01-01]', '[2수01-03]']),
        lesson('n-compose', '수의 분해와 합성', '하나의 수를 두 수로 나누고 다시 합쳐요.', 'compose', ['[2수01-04]']),
        lesson('n-ten', '10 만들기', '두 수를 합해 10이 되는 짝을 찾아요.', 'make10', ['[2수01-04]', '[2수01-06]']),
        lesson('n-basic-op', '한 자리 수의 덧셈과 뺄셈', '합치기와 덜어내기를 식으로 나타내요.', 'arithmetic', ['[2수01-05]', '[2수01-06]']),
        lesson('n-place', '두 자리 수의 자릿값', '십 묶음과 낱개로 수를 나타내요.', 'place', ['[2수01-02]']),
        lesson('n-multiply', '곱셈의 의미', '같은 수씩 묶어 곱셈식으로 나타내요.', 'array', ['[2수01-10]', '[2수01-11]'])
      ],
      '3-4': [
        lesson('n-big', '큰 수와 자릿값', '만 이상의 수를 읽고 크기를 비교해요.', 'bigNumber', ['[4수01-01]', '[4수01-02]']),
        lesson('n-mul-div', '곱셈과 나눗셈', '곱셈과 나눗셈의 관계를 활용해요.', 'mulDiv', ['[4수01-04]', '[4수01-05]']),
        lesson('n-fraction', '분수의 의미', '전체를 똑같이 나눈 부분을 분수로 나타내요.', 'fraction', ['[4수01-09]', '[4수01-10]']),
        lesson('n-decimal', '소수의 의미', '0.1과 0.01의 자릿값을 이해해요.', 'decimal', ['[4수01-12]', '[4수01-13]']),
        lesson('n-estimate', '어림셈', '계산하기 전에 결과의 범위를 예상해요.', 'estimate', ['[4수01-08]'])
      ],
      '5-6': [
        lesson('n-factor', '약수와 배수', '수의 곱 관계에서 약수와 배수를 찾아요.', 'factor', ['[6수01-01]']),
        lesson('n-round', '올림·버림·반올림', '상황에 알맞은 어림 방법을 선택해요.', 'rounding', ['[6수01-02]']),
        lesson('n-fraction-op', '분수의 계산', '분수의 덧셈·뺄셈·곱셈·나눗셈 원리를 탐구해요.', 'fractionOp', ['[6수01-05]', '[6수01-08]']),
        lesson('n-decimal-op', '소수의 계산', '소수의 곱셈과 나눗셈을 생활 문제에 적용해요.', 'decimalOp', ['[6수01-09]', '[6수01-10]']),
        lesson('n-mixed', '혼합 계산', '계산 순서를 생각하며 여러 연산을 해결해요.', 'mixed', ['[6수01-03]'])
      ]
    }
  },
  {
    id: 'relation', title: '변화와 관계', icon: '🔁', color: '#9b6dff',
    idea: '규칙과 두 양 사이의 관계를 수, 식, 표로 표현해요.',
    bands: {
      '1-2': [
        lesson('r-repeat', '반복 규칙', '색과 모양이 반복되는 규칙을 완성해요.', 'pattern', ['[2수02-01]']),
        lesson('r-grow', '증가하는 규칙', '일정하게 커지는 수의 규칙을 찾아요.', 'sequence', ['[2수02-01]']),
        lesson('r-create', '나만의 규칙', '스스로 규칙을 정해 배열을 만들어요.', 'createPattern', ['[2수02-02]'])
      ],
      '3-4': [
        lesson('r-expression', '규칙을 수나 식으로', '변화 규칙을 수와 식으로 나타내요.', 'ruleExpression', ['[4수02-01]']),
        lesson('r-equal', '등호와 동치 관계', '등호 양쪽의 값이 같은지 판단해요.', 'balance', ['[4수02-03]']),
        lesson('r-calc-pattern', '계산식의 규칙', '계산 결과의 규칙을 찾아 다음 값을 추측해요.', 'calcPattern', ['[4수02-02]'])
      ],
      '5-6': [
        lesson('r-machine', '대응 관계', '입력과 출력 사이의 규칙을 표와 식으로 나타내요.', 'functionMachine', ['[6수02-01]']),
        lesson('r-ratio', '비와 비율', '두 양의 관계를 비와 비율로 나타내요.', 'ratio', ['[6수02-02]', '[6수02-03]']),
        lesson('r-percent', '백분율', '비율을 분수, 소수, 백분율로 바꾸어요.', 'percent', ['[6수02-04]']),
        lesson('r-proportion', '비례식과 비례배분', '비례 관계를 이용해 양을 나누어요.', 'proportion', ['[6수02-05]', '[6수02-06]'])
      ]
    }
  },
  {
    id: 'geometry', title: '도형과 측정', icon: '📐', color: '#ff9a45',
    idea: '도형의 성질을 탐구하고 여러 양을 비교하고 측정해요.',
    bands: {
      '1-2': [
        lesson('g-shapes', '생활 속 도형', '삼각형, 사각형, 원의 모양을 찾아요.', 'shapeClassify', ['[2수03-03]', '[2수03-04]']),
        lesson('g-solid', '입체도형의 모양', '상자, 둥근 기둥, 공 모양을 구별해요.', 'solidClassify', ['[2수03-01]']),
        lesson('g-compare', '양의 비교', '길이, 들이, 무게, 넓이를 비교해요.', 'compareMeasure', ['[2수03-06]']),
        lesson('g-length', '길이 재기', 'cm와 m를 사용해 길이를 나타내요.', 'length', ['[2수03-10]', '[2수03-11]']),
        lesson('g-time', '시각과 시간', '시계를 보고 시각을 읽어요.', 'time', ['[2수03-07]', '[2수03-08]'])
      ],
      '3-4': [
        lesson('g-angle', '각과 각도', '각의 크기를 비교하고 각도기로 재어요.', 'angle', ['[4수03-13]']),
        lesson('g-triangle', '여러 가지 삼각형', '변과 각의 특징으로 삼각형을 분류해요.', 'triangleClassify', ['[4수03-07]', '[4수03-08]']),
        lesson('g-quad', '여러 가지 사각형', '수직과 평행을 이용해 사각형을 분류해요.', 'quadClassify', ['[4수03-09]', '[4수03-10]']),
        lesson('g-move', '평면도형의 이동', '도형을 밀고 뒤집고 돌린 결과를 예상해요.', 'transform', ['[4수03-12]']),
        lesson('g-units', '들이와 무게', 'L, mL, kg, g의 관계를 활용해요.', 'units', ['[4수03-16]', '[4수03-17]'])
      ],
      '5-6': [
        lesson('g-symmetry', '합동과 대칭', '합동, 선대칭, 점대칭을 탐구해요.', 'symmetry', ['[6수03-01]', '[6수03-02]']),
        lesson('g-area', '다각형의 넓이', '도형을 변형하여 넓이 공식을 이해해요.', 'area', ['[6수03-05]', '[6수03-06]']),
        lesson('g-circle', '원주와 원의 넓이', '원주율을 이용해 원주와 넓이를 구해요.', 'circle', ['[6수03-08]', '[6수03-09]']),
        lesson('g-solid2', '입체도형', '각기둥, 각뿔, 원기둥, 원뿔, 구를 분류해요.', 'solidAdvanced', ['[6수03-10]', '[6수03-11]']),
        lesson('g-volume', '겉넓이와 부피', '단위 정육면체로 부피의 원리를 이해해요.', 'volume', ['[6수03-12]', '[6수03-13]'])
      ]
    }
  },
  {
    id: 'data', title: '자료와 가능성', icon: '📊', color: '#24bd87',
    idea: '자료를 모아 표와 그래프로 나타내고 근거 있게 판단해요.',
    bands: {
      '1-2': [
        lesson('d-classify', '기준에 따라 분류', '같은 특징을 가진 대상을 모아요.', 'dataClassify', ['[2수04-01]']),
        lesson('d-table', '표로 나타내기', '분류한 자료를 표로 정리해요.', 'table', ['[2수04-02]']),
        lesson('d-symbol', '기호 그래프', '○, ×, /로 자료의 수를 나타내요.', 'symbolGraph', ['[2수04-03]'])
      ],
      '3-4': [
        lesson('d-picture', '그림그래프', '그림 하나가 여러 개를 나타내는 그래프를 읽어요.', 'pictureGraph', ['[4수04-01]']),
        lesson('d-bar', '막대그래프', '막대의 길이로 자료의 크기를 비교해요.', 'barGraph', ['[4수04-02]']),
        lesson('d-line', '꺾은선그래프', '시간에 따른 변화를 그래프로 해석해요.', 'lineGraph', ['[4수04-03]'])
      ],
      '5-6': [
        lesson('d-average', '평균', '자료를 고르게 만들었을 때의 값을 구해요.', 'average', ['[6수04-01]']),
        lesson('d-circle', '띠그래프와 원그래프', '전체에 대한 각 부분의 비율을 나타내요.', 'ratioGraph', ['[6수04-02]']),
        lesson('d-chance', '가능성', '사건이 일어날 가능성을 비교하고 표현해요.', 'chance', ['[6수04-03]']),
        lesson('d-investigate', '통계적 문제 해결', '질문을 정하고 자료를 모아 결론을 내려요.', 'investigation', ['[6수04-04]'])
      ]
    }
  }
];

function lesson(id, title, summary, type, standards) { return { id, title, summary, type, standards }; }
const state = { band: '1-2', current: null, step: 0, question: null, completed: loadProgress() };
function loadProgress(){try{return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));}catch{return new Set();}}
function saveProgress(){localStorage.setItem(STORAGE_KEY,JSON.stringify([...state.completed]));}
function allLessons(){return CURRICULUM.flatMap(area=>BANDS.flatMap(band=>area.bands[band]));}
function completedPercent(){return Math.round(state.completed.size/allLessons().length*100);}
function findLesson(id){for(const area of CURRICULUM)for(const band of BANDS){const item=area.bands[band].find(x=>x.id===id);if(item)return{area,band,item};}return null;}
function showSection(id){document.querySelectorAll('.view-section').forEach(section=>{const visible=section.id===id;section.classList.toggle('hidden',!visible);section.style.display=visible?'flex':'none';});document.getElementById('aiedue-rpg-hud')?.classList.remove('hidden');}
window.openSpiralMap=function(){showSection('spiral-map-section');renderMap();};
window.openSpiralCurriculum=window.openSpiralMap;
window.openSpiralLesson=function(id){const found=findLesson(id);if(!found)return;state.current=found;state.band=found.band;state.step=0;state.question=null;showSection('spiral-lesson-section');renderLesson();};
window.goBackFromSpiral=function(){if(!document.getElementById('spiral-lesson-section')?.classList.contains('hidden'))openSpiralMap();else window.openDashboard?.();};

function renderMap(){const root=document.getElementById('spiral-map-content');if(!root)return;root.innerHTML=`<main class="spiral-shell"><header class="spiral-hero"><div><p class="spiral-eyebrow">2022 개정 초등 수학</p><h1>나선형 배움 지도</h1><p>같은 핵심 개념을 다시 만나며 더 깊게 배워요.</p></div><div class="spiral-progress"><strong>전체 성장 ${completedPercent()}%</strong><div class="spiral-progress-track"><div class="spiral-progress-fill" style="width:${completedPercent()}%"></div></div><small>${state.completed.size} / ${allLessons().length}개 개념 완료</small></div></header><nav class="spiral-tabs" aria-label="학년군 선택">${BANDS.map(b=>`<button class="spiral-tab ${state.band===b?'active':''}" data-band="${b}">${b.replace('-','~')}학년</button>`).join('')}</nav><section class="spiral-grid">${CURRICULUM.map(area=>renderArea(area)).join('')}</section><section class="spiral-guide spiral-panel"><h2>배움 방법</h2><div class="spiral-guide-steps">${STEPS.map((s,i)=>`<span><b>${i+1}</b>${s}</span>`).join('')}</div><p>각 개념에서 생활 경험, 조작, 그림, 수식, 설명, 적용을 차례로 경험합니다.</p></section></main>`;root.querySelectorAll('.spiral-tab').forEach(btn=>btn.addEventListener('click',()=>{state.band=btn.dataset.band;renderMap();}));root.querySelectorAll('.spiral-node:not(.locked)').forEach(btn=>btn.addEventListener('click',()=>openSpiralLesson(btn.dataset.id)));}
function renderArea(area){const lessons=area.bands[state.band];return `<article class="spiral-area" style="--area:${area.color}"><div class="spiral-area-head"><span>${area.icon}</span><div><h2>${area.title}</h2><small>${area.idea}</small></div></div><div class="spiral-nodes">${lessons.map((item,index)=>{const done=state.completed.has(item.id),previous=lessons[index-1],locked=index>0&&previous&&!state.completed.has(previous.id);return `<button class="spiral-node ${done?'completed':''} ${locked?'locked':''}" data-id="${item.id}" ${locked?'disabled':''}><span class="node-state">${done?'✓':locked?'🔒':index+1}</span><span><strong>${item.title}</strong><small>${item.summary}</small></span></button>`;}).join('')}</div></article>`;}
function renderLesson(){const root=document.getElementById('spiral-lesson-content');if(!root||!state.current)return;const{area,band,item}=state.current;if(!state.question)state.question=makeQuestion(item.type,state.step);root.innerHTML=`<main class="spiral-shell lesson-shell"><header class="spiral-lesson-head spiral-panel" style="--area:${area.color}"><button class="spiral-back" onclick="openSpiralMap()">← 배움 지도</button><div class="lesson-heading"><span>${area.icon}</span><div><p>${area.title} · ${band.replace('-','~')}학년</p><h1>${item.title}</h1><p>${item.summary}</p></div></div><div class="standard-chips">${item.standards.map(s=>`<span>${s}</span>`).join('')}</div></header><section class="spiral-panel spiral-learning"><nav class="spiral-step-list" aria-label="학습 단계">${STEPS.map((s,i)=>`<button class="spiral-step ${i===state.step?'active':''} ${i<state.step?'done':''}" data-step="${i}"><b>${i+1}</b>${s}</button>`).join('')}</nav><div class="spiral-task" id="spiral-task">${renderTask(item,state.question)}</div></section></main>`;root.querySelectorAll('.spiral-step').forEach(btn=>btn.addEventListener('click',()=>{const next=Number(btn.dataset.step);if(next<=state.step){state.step=next;state.question=makeQuestion(item.type,next);renderLesson();}}));bindTaskEvents(item);}
function renderTask(item,q){return `<div class="task-top"><span class="task-stage-badge">${state.step+1}. ${STEPS[state.step]}</span><button class="speak-button" type="button" data-speak="${escapeText(q.prompt)}">🔊 읽어주기</button></div><h2>${q.title}</h2><p class="task-prompt">${q.prompt}</p><div class="activity-visual">${q.visual||''}</div><div class="spiral-options">${q.options.map(option=>`<button class="spiral-option" data-value="${escapeAttr(String(option.value))}">${option.label}</button>`).join('')}</div><div id="spiral-feedback" class="spiral-feedback" aria-live="polite"></div><div class="spiral-actions"><button class="spiral-action secondary" id="spiral-hint">💡 힌트</button><button class="spiral-action secondary" id="spiral-new">↻ 새 문제</button></div>`;}
function bindTaskEvents(item){document.querySelectorAll('.spiral-option').forEach(button=>button.addEventListener('click',()=>checkAnswer(item,button)));document.getElementById('spiral-hint')?.addEventListener('click',()=>feedback(state.question.hint,'hint'));document.getElementById('spiral-new')?.addEventListener('click',()=>{state.question=makeQuestion(item.type,state.step);renderLesson();});document.querySelector('.speak-button')?.addEventListener('click',event=>speak(event.currentTarget.dataset.speak));}
function checkAnswer(item,button){const value=button.dataset.value,correct=String(state.question.answer)===value;document.querySelectorAll('.spiral-option').forEach(x=>x.disabled=true);button.classList.add(correct?'correct':'wrong');if(!correct){document.querySelector(`.spiral-option[data-value="${CSS.escape(String(state.question.answer))}"]`)?.classList.add('correct');feedback(`다시 살펴봐요. ${state.question.explain}`,'bad');setTimeout(()=>{state.question=makeQuestion(item.type,state.step);renderLesson();},1600);return;}feedback(`잘했어요! ${state.question.explain}`,'good');if(state.step<STEPS.length-1){setTimeout(()=>{state.step+=1;state.question=makeQuestion(item.type,state.step);renderLesson();},1000);}else{state.completed.add(item.id);saveProgress();setTimeout(()=>{feedback('개념을 완료했어요! 배움 지도에서 다음 개념이 열렸습니다.','good');const actions=document.querySelector('.spiral-actions');if(actions)actions.innerHTML='<button class="spiral-action" onclick="openSpiralMap()">배움 지도로 돌아가기</button><button class="spiral-action secondary" id="spiral-again">다시 연습</button>';document.getElementById('spiral-again')?.addEventListener('click',()=>{state.step=0;state.question=makeQuestion(item.type,0);renderLesson();});},700);}}
function feedback(text,type){const el=document.getElementById('spiral-feedback');if(!el)return;el.textContent=text;el.className=`spiral-feedback ${type}`;}
function makeQuestion(type,step){const generators={count:qCount,compose:qCompose,make10:qMake10,arithmetic:qArithmetic,place:qPlace,array:qArray,bigNumber:qBigNumber,mulDiv:qMulDiv,fraction:qFraction,decimal:qDecimal,estimate:qEstimate,factor:qFactor,rounding:qRounding,fractionOp:qFractionOp,decimalOp:qDecimalOp,mixed:qMixed,pattern:qPattern,sequence:qSequence,createPattern:qCreatePattern,ruleExpression:qRuleExpression,balance:qBalance,calcPattern:qCalcPattern,functionMachine:qFunctionMachine,ratio:qRatio,percent:qPercent,proportion:qProportion,shapeClassify:qShape,solidClassify:qSolid,compareMeasure:qCompare,length:qLength,time:qTime,angle:qAngle,triangleClassify:qTriangle,quadClassify:qQuad,transform:qTransform,units:qUnits,symmetry:qSymmetry,area:qArea,circle:qCircle,solidAdvanced:qSolidAdvanced,volume:qVolume,dataClassify:qDataClassify,table:qTable,symbolGraph:qSymbolGraph,pictureGraph:qPictureGraph,barGraph:qBarGraph,lineGraph:qLineGraph,average:qAverage,ratioGraph:qRatioGraph,chance:qChance,investigation:qInvestigation};return(generators[type]||qGeneric)(step);}
function baseQuestion(title,prompt,visual,options,answer,hint,explain){return{title,prompt,visual,options:shuffle(options.map(v=>typeof v==='object'?v:({value:v,label:v}))),answer,hint,explain};}
function nums(correct,spread=3){const set=new Set([correct]);while(set.size<4)set.add(Math.max(0,correct+rand(-spread,spread)));return[...set];}
function qCount(step){const n=rand(4,18);return baseQuestion(STEPS[step]+'하며 수 세기','별의 개수는 몇 개인가요?',`<div class="object-cloud">${'⭐'.repeat(n)}</div>`,nums(n),n,'별을 하나씩 손가락으로 짚으며 세어 보세요.',`${n}개입니다.`);}
function qCompose(step){const total=rand(6,15),a=rand(1,total-1),b=total-a;return baseQuestion('수를 두 부분으로 나누기',`${total}은 ${a}와 얼마로 나눌 수 있나요?`,`<div class="part-whole"><div>${total}</div><span>↙</span><span>↘</span><div>${a}</div><div>?</div></div>`,nums(b),b,`${a}에서 ${total}까지 이어 세어 보세요.`,`${a}+${b}=${total}입니다.`);}
function qMake10(){const a=rand(1,9),b=10-a;return baseQuestion('10의 짝 찾기',`${a}에 얼마를 더하면 10이 될까요?`,tenFrame(a),nums(b),b,'10칸 중 비어 있는 칸을 세어 보세요.',`${a}+${b}=10입니다.`);}
function qArithmetic(){const add=Math.random()>.45;let a=rand(2,9),b=rand(1,9);if(!add&&b>a)[a,b]=[b,a];const ans=add?a+b:a-b;return baseQuestion('덧셈과 뺄셈',`${a} ${add?'+':'−'} ${b} = ?`,`<div class="equation-visual">${a} ${add?'+':'−'} ${b}</div>`,nums(ans,4),ans,add?'두 모음을 합쳐 보세요.':'먼저 있던 것에서 덜어내세요.',`답은 ${ans}입니다.`);}
function qPlace(){const tens=rand(1,9),ones=rand(0,9),ans=tens*10+ones;return baseQuestion('십 묶음과 낱개',`십 묶음 ${tens}개와 낱개 ${ones}개는 얼마인가요?`,placeBlocks(tens,ones),nums(ans,10),ans,`십 묶음은 ${tens*10}입니다.`,`${tens*10}+${ones}=${ans}입니다.`);}
function qArray(){const rows=rand(2,5),cols=rand(2,5),ans=rows*cols;return baseQuestion('배열로 곱셈 이해하기',`${rows}개씩 ${cols}줄이면 모두 몇 개인가요?`,`<div class="dot-array" style="grid-template-columns:repeat(${rows},36px)">${'<i></i>'.repeat(ans)}</div>`,nums(ans,6),ans,`${rows}를 ${cols}번 더해 보세요.`,`${rows}×${cols}=${ans}입니다.`);}
function qBigNumber(){const a=rand(12,98)*1000,b=a+rand(1,8)*100,ans=Math.max(a,b);return baseQuestion('큰 수 비교하기','더 큰 수를 고르세요.',`<div class="compare-card">${a.toLocaleString()} <span>VS</span> ${b.toLocaleString()}</div>`,[{value:a,label:a.toLocaleString()},{value:b,label:b.toLocaleString()}],ans,'가장 높은 자리부터 비교하세요.',`${ans.toLocaleString()}이 더 큽니다.`);}
function qMulDiv(){const b=rand(2,9),c=rand(2,9),total=b*c;return baseQuestion('곱셈과 나눗셈의 관계',`${total}÷${b}의 몫은 얼마인가요?`,`<div class="group-visual">${Array.from({length:c},()=>`<span>${'●'.repeat(b)}</span>`).join('')}</div>`,nums(c),c,`${b}×?=${total}인 수를 찾으세요.`,`${b}×${c}=${total}이므로 몫은 ${c}입니다.`);}
function qFraction(){const den=rand(3,8),num=rand(1,den-1);return baseQuestion('부분을 분수로 나타내기',`${den}칸 중 ${num}칸을 색칠했습니다. 알맞은 분수는?`,fractionBar(num,den),[{value:`${num}/${den}`,label:`${num}/${den}`},{value:`${den}/${num}`,label:`${den}/${num}`},{value:`${num}/${den+1}`,label:`${num}/${den+1}`}],`${num}/${den}`,'전체 칸 수는 분모, 색칠한 칸 수는 분자입니다.',`분수는 ${num}/${den}입니다.`);}
function qDecimal(){const tenths=rand(1,9),ans=(tenths/10).toFixed(1);return baseQuestion('소수로 나타내기',`10칸 중 ${tenths}칸을 색칠했습니다. 소수로 나타내면?`,fractionBar(tenths,10),[{value:ans,label:ans},{value:String(tenths),label:String(tenths)},{value:`0.0${tenths}`,label:`0.0${tenths}`}],ans,'한 칸은 0.1입니다.',`${tenths}개의 0.1은 ${ans}입니다.`);}
function qEstimate(){const a=rand(21,78),b=rand(12,49),sum=a+b,rounded=Math.round(sum/10)*10;return baseQuestion('계산 결과 어림하기',`${a}+${b}의 결과와 가장 가까운 십의 자리 수는?`,`<div class="number-line-simple"><span>${rounded-20}</span><span>${rounded-10}</span><span>${rounded}</span><span>${rounded+10}</span></div>`,[rounded-10,rounded,rounded+10,rounded+20],rounded,'각 수를 가까운 십의 자리로 어림해 더해 보세요.',`실제 합은 ${sum}이고, 가장 가까운 십의 자리는 ${rounded}입니다.`);}
function qFactor(){const n=[12,18,20,24,30][rand(0,4)],factors=[];for(let i=1;i<=n;i++)if(n%i===0)factors.push(i);const ans=factors[rand(0,factors.length-1)],wrong=n+1;return baseQuestion('약수 찾기',`${n}의 약수인 수는?`,`<div class="factor-box">${n}</div>`,[ans,wrong,n-1,n+3],ans,`${n}을 나누어떨어지게 하는 수를 찾으세요.`,`${n}÷${ans}은 나누어떨어집니다.`);}
function qRounding(){const n=rand(101,999),ans=Math.round(n/10)*10;return baseQuestion('반올림하기',`${n}을 십의 자리까지 반올림하면?`,`<div class="round-number">${n}</div>`,nums(ans,20).map(x=>Math.round(x/10)*10),ans,'일의 자리 숫자가 5 이상인지 살펴보세요.',`반올림한 값은 ${ans}입니다.`);}
function qFractionOp(){const den=[4,5,6,8][rand(0,3)],a=rand(1,den-2),b=rand(1,den-a),ans=`${a+b}/${den}`;return baseQuestion('같은 분모의 분수 덧셈',`${a}/${den}+${b}/${den}=?`,fractionBar(a+b,den),[{value:ans,label:ans},{value:`${a+b}/${den*2}`,label:`${a+b}/${den*2}`},{value:`${a*b}/${den}`,label:`${a*b}/${den}`}],ans,'분모는 그대로 두고 분자를 더하세요.',`답은 ${ans}입니다.`);}
function qDecimalOp(){const a=rand(11,49)/10,b=rand(2,9)/10,ans=(a+b).toFixed(1);return baseQuestion('소수 덧셈',`${a.toFixed(1)}+${b.toFixed(1)}=?`,`<div class="decimal-grid">${a.toFixed(1)} + ${b.toFixed(1)}</div>`,nums(Math.round((a+b)*10),4).map(x=>({value:(x/10).toFixed(1),label:(x/10).toFixed(1)})),ans,'소수점을 맞추어 계산하세요.',`답은 ${ans}입니다.`);}
function qMixed(){const a=rand(2,8),b=rand(2,6),c=rand(1,9),ans=a*b+c;return baseQuestion('혼합 계산 순서',`${a}×${b}+${c}=?`,`<div class="equation-visual">${a} × ${b} + ${c}</div>`,nums(ans,8),ans,'곱셈을 먼저 계산하세요.',`${a}×${b}=${a*b}, 여기에 ${c}을 더하면 ${ans}입니다.`);}
function qPattern(){const patterns=[['🔵','🟡'],['▲','■','●'],['🍎','🍐','🍐']],p=patterns[rand(0,patterns.length-1)],len=rand(4,7),seq=Array.from({length:len},(_,i)=>p[i%p.length]),ans=p[len%p.length];return baseQuestion('반복 규칙 이어가기',`${seq.join(' ')} 다음에 올 것은?`,`<div class="pattern-strip">${seq.join(' ')}</div>`,[...new Set([...p,'⭐'])],ans,'처음부터 같은 묶음이 반복되는지 살펴보세요.',`반복되는 순서에 따라 ${ans}가 옵니다.`);}
function qSequence(){const start=rand(1,10),d=rand(2,5),seq=[0,1,2,3].map(i=>start+i*d),ans=start+4*d;return baseQuestion('수의 규칙 찾기',`${seq.join(', ')}, ?`,`<div class="sequence-row">${seq.map(x=>`<span>${x}</span>`).join('<b>→</b>')}<b>→</b><span>?</span></div>`,nums(ans,6),ans,'앞 수에서 얼마씩 커지는지 확인하세요.',`${d}씩 커지므로 다음 수는 ${ans}입니다.`);}
function qCreatePattern(){return baseQuestion('규칙 설명하기','🔺🔵🔺🔵🔺🔵 배열의 규칙을 가장 잘 설명한 것은?',`<div class="pattern-strip">🔺 🔵 🔺 🔵 🔺 🔵</div>`,[{value:'alternate',label:'삼각형과 원이 번갈아 나온다'},{value:'grow',label:'모양이 점점 커진다'},{value:'three',label:'세 모양씩 반복된다'}],'alternate','반복되는 가장 작은 묶음을 찾으세요.','삼각형과 원이 번갈아 반복됩니다.');}
function qRuleExpression(){const x=rand(2,6),ans=x*3+1;return baseQuestion('규칙을 식으로 표현하기',`입력한 수에 3을 곱하고 1을 더합니다. ${x}를 넣으면?`,machineVisual(x,ans),nums(ans,6),ans,`${x}×3을 먼저 계산하세요.`,`${x}×3+1=${ans}입니다.`);}
function qBalance(){const a=rand(2,9),b=rand(2,9),sum=a+b,c=rand(1,sum-1),d=sum-c;return baseQuestion('같은 값의 식 찾기',`${a}+${b}와 값이 같은 식은?`,`<div class="balance-visual"><span>${a}+${b}</span><b>=</b><span>?</span></div>`,[{value:`${c}+${d}`,label:`${c}+${d}`},{value:`${c}+${d+1}`,label:`${c}+${d+1}`},{value:`${c+2}+${d}`,label:`${c+2}+${d}`}],`${c}+${d}`,'등호 양쪽을 각각 계산해 비교하세요.',`두 식 모두 ${sum}입니다.`);}
function qCalcPattern(){const n=rand(2,5),ans=(n+1)*(n+1);return baseQuestion('계산식 배열의 규칙',`1×1=1, 2×2=4, ${n}×${n}=${n*n}, ${n+1}×${n+1}=?`,`<div class="calc-ladder">1, 4, 9, 16, ...</div>`,nums(ans,8),ans,'같은 수끼리 곱하는 규칙입니다.',`${n+1}×${n+1}=${ans}입니다.`);}
function qFunctionMachine(){const rule=rand(2,5),input=rand(2,9),ans=input*rule;return baseQuestion('대응 관계 찾기',`입력에 ${rule}를 곱하는 기계입니다. ${input}의 출력은?`,machineVisual(input,ans),nums(ans,8),ans,`입력값에 ${rule}를 곱하세요.`,`출력은 ${ans}입니다.`);}
function qRatio(){const a=rand(1,4),b=rand(2,6),ans=`${a}:${b}`;return baseQuestion('비로 나타내기',`빨간 구슬 ${a}개와 파란 구슬 ${b}개의 비는?`,`<div class="beads"><span>${'🔴'.repeat(a)}</span><span>${'🔵'.repeat(b)}</span></div>`,[{value:ans,label:ans},{value:`${b}:${a}`,label:`${b}:${a}`},{value:`${a+b}:${b}`,label:`${a+b}:${b}`}],ans,'말한 순서대로 두 수를 : 기호로 연결하세요.',`빨강:파랑=${ans}입니다.`);}
function qPercent(){const n=[10,20,25,50,75][rand(0,4)],ans=`${n}%`;return baseQuestion('백분율로 나타내기',`100칸 중 ${n}칸을 색칠했습니다. 백분율은?`,percentGrid(n),[{value:ans,label:ans},{value:`${100-n}%`,label:`${100-n}%`},{value:`${n/100}%`,label:`${n/100}%`}],ans,'100개 중 몇 개인지를 %로 나타냅니다.',`${n}/100=${ans}입니다.`);}
function qProportion(){const people=rand(2,5),each=rand(2,6),target=people+rand(1,4),ans=each*target;return baseQuestion('비례 관계 적용하기',`${people}명에게 1인당 ${each}개씩 필요합니다. ${target}명에게는 몇 개가 필요할까요?`,`<div class="ratio-table"><span>사람 ${people}</span><span>물건 ${people*each}</span><span>사람 ${target}</span><span>물건 ?</span></div>`,nums(ans,8),ans,`한 사람에게 ${each}개씩입니다.`,`${target}×${each}=${ans}개입니다.`);}
function qShape(){const shapes=[['삼각형','△'],['사각형','□'],['원','○']],picked=shapes[rand(0,2)];return baseQuestion('도형의 이름','이 모양의 이름은 무엇인가요?',`<div class="big-shape">${picked[1]}</div>`,shapes.map(x=>({value:x[0],label:x[0]})),picked[0],'변이나 꼭짓점의 개수를 살펴보세요.',`${picked[0]}입니다.`);}
function qSolid(){const items=[['직육면체 모양','📦'],['원기둥 모양','🥫'],['구 모양','⚽']],p=items[rand(0,2)];return baseQuestion('입체도형의 모양',`${p[1]}와 닮은 모양은?`,`<div class="big-object">${p[1]}</div>`,items.map(x=>({value:x[0],label:x[0]})),p[0],'굴러가는 면과 평평한 면을 살펴보세요.',`${p[0]}입니다.`);}
function qCompare(){const a=rand(2,8),b=rand(a+1,12);return baseQuestion('길이 비교하기','어느 막대가 더 긴가요?',`<div class="length-bars"><span style="width:${a*20}px">A</span><span style="width:${b*20}px">B</span></div>`,[{value:'A',label:'A 막대'},{value:'B',label:'B 막대'}],'B','막대의 끝 위치를 비교하세요.','B 막대가 더 깁니다.');}
function qLength(){const cm=rand(2,12);return baseQuestion('자로 길이 재기','막대의 길이는 몇 cm인가요?',rulerVisual(cm),nums(cm),cm,'0에서 시작해 막대 끝의 눈금을 읽으세요.',`${cm}cm입니다.`);}
function qTime(){const hour=rand(1,12),minute=[0,30][rand(0,1)],ans=`${hour}:${String(minute).padStart(2,'0')}`;return baseQuestion('시계 읽기','시계가 나타내는 시각은?',clockVisual(hour,minute),[{value:ans,label:`${hour}시 ${minute?'30분':''}`},{value:`${hour===12?1:hour+1}:00`,label:`${hour===12?1:hour+1}시`},{value:`${hour}:15`,label:`${hour}시 15분`}],ans,'짧은 바늘은 시, 긴 바늘은 분을 나타냅니다.',`${hour}시 ${minute?'30분':'정각'}입니다.`);}
function qAngle(){const angles=[30,45,60,90,120,150],a=angles[rand(0,angles.length-1)];return baseQuestion('각의 크기',`${a}°는 어떤 각인가요?`,angleVisual(a),[{value:'acute',label:'예각'},{value:'right',label:'직각'},{value:'obtuse',label:'둔각'}],a===90?'right':a<90?'acute':'obtuse','90°와 비교하세요.',a===90?'직각입니다.':a<90?'90°보다 작은 예각입니다.':'90°보다 큰 둔각입니다.');}
function qTriangle(){const types=[['정삼각형','세 변의 길이가 모두 같다'],['이등변삼각형','두 변의 길이가 같다'],['직각삼각형','한 각이 직각이다']],p=types[rand(0,2)];return baseQuestion('삼각형 분류',`${p[1]}인 삼각형은?`,`<div class="triangle-icon">△</div>`,types.map(x=>({value:x[0],label:x[0]})),p[0],'변의 길이와 각의 특징을 떠올리세요.',`${p[0]}입니다.`);}
function qQuad(){const types=[['평행사변형','두 쌍의 마주 보는 변이 평행'],['직사각형','네 각이 모두 직각'],['정사각형','네 변이 같고 네 각이 직각'],['사다리꼴','한 쌍의 마주 보는 변이 평행']],p=types[rand(0,3)];return baseQuestion('사각형 분류',`${p[1]}인 사각형은?`,`<div class="quad-icon">▱ □ ▭</div>`,types.map(x=>({value:x[0],label:x[0]})),p[0],'평행한 변과 직각의 수를 살펴보세요.',`${p[0]}입니다.`);}
function qTransform(){return baseQuestion('도형 이동','→ 방향으로 미는 것은 어떤 이동인가요?',`<div class="transform-visual">▲ &nbsp; → &nbsp; ▲</div>`,[{value:'slide',label:'밀기'},{value:'flip',label:'뒤집기'},{value:'turn',label:'돌리기'}],'slide','모양과 방향이 그대로인지 살펴보세요.','위치만 바뀌었으므로 밀기입니다.');}
function qUnits(){const ml=rand(2,9)*1000,ans=ml/1000;return baseQuestion('들이 단위 바꾸기',`${ml}mL는 몇 L인가요?`,`<div class="unit-card">${ml} mL = ? L</div>`,nums(ans),ans,'1000mL가 1L입니다.',`${ml}mL=${ans}L입니다.`);}
function qSymmetry(){return baseQuestion('대칭 찾기','접었을 때 완전히 겹치는 선을 무엇이라고 하나요?',`<div class="symmetry-visual">🦋<i></i></div>`,[{value:'axis',label:'대칭축'},{value:'edge',label:'변'},{value:'radius',label:'반지름'}],'axis','도형을 반으로 접는 선입니다.','대칭축입니다.');}
function qArea(){const w=rand(2,8),h=rand(2,7),ans=w*h;return baseQuestion('직사각형 넓이',`가로 ${w}cm, 세로 ${h}cm인 직사각형의 넓이는?`,gridRect(w,h),nums(ans,8),ans,'가로의 칸 수와 세로의 칸 수를 곱하세요.',`${w}×${h}=${ans}cm²입니다.`);}
function qCircle(){const r=rand(2,6),c=Math.round(2*3.14*r*100)/100;return baseQuestion('원의 둘레',`반지름이 ${r}cm인 원의 원주는? (원주율 3.14)`,`<div class="circle-visual" style="width:${r*22}px;height:${r*22}px"><i></i></div>`,[{value:String(c),label:`${c}cm`},{value:String(3.14*r),label:`${3.14*r}cm`},{value:String(r*r),label:`${r*r}cm`}],String(c),'지름×원주율 또는 2×반지름×원주율을 사용하세요.',`2×${r}×3.14=${c}cm입니다.`);}
function qSolidAdvanced(){const types=[['각기둥','밑면이 서로 합동이고 평행한 다각형'],['각뿔','한 꼭짓점에 옆면이 모이는 입체도형'],['원기둥','두 밑면이 합동인 원'],['원뿔','밑면이 원이고 한 꼭짓점이 있음']],p=types[rand(0,3)];return baseQuestion('입체도형 분류',`${p[1]}은 무엇인가요?`,`<div class="solid-icons">⬡ ◭ ⏢</div>`,types.map(x=>({value:x[0],label:x[0]})),p[0],'밑면의 모양과 꼭짓점을 살펴보세요.',`${p[0]}입니다.`);}
function qVolume(){const l=rand(2,5),w=rand(2,4),h=rand(2,4),ans=l*w*h;return baseQuestion('직육면체 부피',`가로 ${l}, 세로 ${w}, 높이 ${h}인 직육면체의 부피는?`,cubeStack(l,w,h),nums(ans,10),ans,'한 층의 개수에 층 수를 곱하세요.',`${l}×${w}×${h}=${ans}입니다.`);}
function qDataClassify(){return baseQuestion('분류 기준 찾기','🍎🍓🍒와 🥕🥦🌽를 나눈 기준은?',`<div class="classify-box"><span>🍎🍓🍒</span><span>🥕🥦🌽</span></div>`,[{value:'kind',label:'과일과 채소'},{value:'size',label:'큰 것과 작은 것'},{value:'color',label:'빨간색과 파란색'}],'kind','각 모둠의 공통 특징을 찾아보세요.','과일과 채소로 분류했습니다.');}
function qTable(){const cats=rand(2,6),dogs=rand(2,6),ans=Math.max(cats,dogs);return baseQuestion('표 읽기','더 많은 동물의 수는 몇 마리인가요?',`<table class="data-table"><tr><th>고양이</th><th>강아지</th></tr><tr><td>${cats}</td><td>${dogs}</td></tr></table>`,nums(ans),ans,'표의 두 수를 비교하세요.',`더 많은 쪽은 ${ans}마리입니다.`);}
function qSymbolGraph(){const n=rand(3,8);return baseQuestion('기호 그래프 읽기','○ 하나가 1명을 뜻합니다. 모두 몇 명인가요?',`<div class="symbol-row">${'○ '.repeat(n)}</div>`,nums(n),n,'기호의 개수를 세어 보세요.',`${n}명입니다.`);}
function qPictureGraph(){const icons=rand(2,6),unit=2,ans=icons*unit;return baseQuestion('그림그래프 읽기',`🍎 하나가 ${unit}개를 뜻합니다. 사과는 모두 몇 개인가요?`,`<div class="picture-row">${'🍎'.repeat(icons)}</div>`,nums(ans,6),ans,`그림 수에 ${unit}를 곱하세요.`,`${icons}×${unit}=${ans}개입니다.`);}
function qBarGraph(){const vals=[rand(2,8),rand(2,8),rand(2,8)],max=Math.max(...vals),idx=vals.indexOf(max),labels=['가','나','다'];return baseQuestion('막대그래프 해석','가장 큰 값을 가진 항목은?',barVisual(vals,labels),labels.map((x,i)=>({value:String(i),label:x})),String(idx),'가장 긴 막대를 찾으세요.',`${labels[idx]}가 가장 큽니다.`);}
function qLineGraph(){const vals=[rand(2,5)];for(let i=1;i<4;i++)vals.push(Math.max(1,vals[i-1]+rand(-1,3)));const increase=vals[3]>vals[0];return baseQuestion('꺾은선그래프 해석','처음과 마지막을 비교하면 전체적으로 어떻게 변했나요?',lineVisual(vals),[{value:'up',label:'증가했다'},{value:'down',label:'감소했다'}],increase?'up':'down','첫 점과 마지막 점의 높이를 비교하세요.',increase?'전체적으로 증가했습니다.':'전체적으로 감소했습니다.');}
function qAverage(){const avg=rand(3,9),vals=[avg-2,avg,avg+2],ans=avg;return baseQuestion('평균 구하기',`${vals.join(', ')}의 평균은?`,`<div class="balance-blocks">${vals.map(v=>`<span style="height:${v*12}px">${v}</span>`).join('')}</div>`,nums(ans),ans,'모두 더한 뒤 자료의 개수로 나누세요.',`(${vals.join('+')})÷3=${ans}입니다.`);}
function qRatioGraph(){const a=[20,25,40,50,60][rand(0,4)],b=100-a;return baseQuestion('비율 그래프 읽기','파란 부분은 전체의 몇 %인가요?',`<div class="ratio-strip"><span style="width:${a}%">${a}%</span><i style="width:${b}%"></i></div>`,[`${a}%`,`${b}%`,'100%'],`${a}%`,'파란 부분 안에 표시된 비율을 읽으세요.',`${a}%입니다.`);}
function qChance(){const red=rand(1,5),blue=rand(red+1,8);return baseQuestion('가능성 비교','주머니에서 어떤 색 공이 나올 가능성이 더 큰가요?',`<div class="bag-visual"><span>${'🔴'.repeat(red)}${'🔵'.repeat(blue)}</span></div>`,[{value:'red',label:'빨간 공'},{value:'blue',label:'파란 공'}],'blue','더 많이 들어 있는 색을 살펴보세요.',`파란 공이 ${blue}개로 더 많아 가능성이 큽니다.`);}
function qInvestigation(){return baseQuestion('통계적 탐구 순서','학급이 좋아하는 과일을 조사할 때 가장 먼저 할 일은?',`<div class="investigation-flow">❓ → 📝 → 📊 → 💡</div>`,[{value:'question',label:'조사 질문 정하기'},{value:'graph',label:'그래프 그리기'},{value:'conclusion',label:'결론 말하기'}],'question','무엇을 알고 싶은지 먼저 정해야 합니다.','먼저 조사 질문을 정합니다.');}
function qGeneric(){return baseQuestion('개념 연습','알맞은 답을 고르세요.','',[1,2,3,4],1,'핵심 개념을 떠올려 보세요.','정답입니다.');}
function tenFrame(n){return `<div class="ten-frame">${Array.from({length:10},(_,i)=>`<span class="ten-cell">${i<n?'<i class="ten-dot"></i>':''}</span>`).join('')}</div>`;}
function fractionBar(n,d){return `<div class="fraction-bar">${Array.from({length:d},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}</div>`;}
function percentGrid(n){return `<div class="percent-grid">${Array.from({length:100},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}</div>`;}
function placeBlocks(t,o){return `<div class="place-blocks"><div>${Array.from({length:t},()=>'<i class="ten-rod"></i>').join('')}</div><div>${Array.from({length:o},()=>'<i class="one-cube"></i>').join('')}</div></div>`;}
function machineVisual(input,output){return `<div class="machine"><span>${input}</span><b>⚙️</b><span>${output}</span></div>`;}
function rulerVisual(cm){return `<div class="ruler"><div class="ruler-stick" style="width:${cm*28}px"></div>${Array.from({length:cm+1},(_,i)=>`<span style="left:${i*28}px">${i}</span>`).join('')}</div>`;}
function clockVisual(h,m){const hr=(h%12)*30+m*.5,mn=m*6;return `<div class="mini-clock"><i class="hour" style="transform:rotate(${hr}deg)"></i><i class="minute" style="transform:rotate(${mn}deg)"></i><b>12</b><em>3</em><strong>6</strong><small>9</small></div>`;}
function angleVisual(a){return `<div class="angle-visual"><i></i><b style="transform:rotate(${-a}deg)"></b><span>${a}°</span></div>`;}
function gridRect(w,h){return `<div class="grid-rect" style="grid-template-columns:repeat(${w},28px)">${'<i></i>'.repeat(w*h)}</div>`;}
function cubeStack(l,w,h){return `<div class="cube-stack">${Array.from({length:h},()=>`<div>${'▣'.repeat(l*w)}</div>`).join('')}</div>`;}
function barVisual(vals,labels){return `<div class="bar-chart">${vals.map((v,i)=>`<div><i style="height:${v*18}px"></i><span>${labels[i]}</span></div>`).join('')}</div>`;}
function lineVisual(vals){const points=vals.map((v,i)=>`${i*30+10},${100-v*12}`).join(' ');return `<svg class="line-chart" viewBox="0 0 110 100"><polyline points="${points}" fill="none" stroke="#35a7ff" stroke-width="5"/>${vals.map((v,i)=>`<circle cx="${i*30+10}" cy="${100-v*12}" r="5" fill="#ff9a45"/>`).join('')}</svg>`;}
function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
function shuffle(array){return array.sort(()=>Math.random()-.5);}
function escapeText(v){return String(v).replace(/["<>]/g,'');}
function escapeAttr(v){return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function speak(text){if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.rate=.9;speechSynthesis.speak(u);}
function installEntryPoints(){const dashboard=document.querySelector('#dashboard-section .math-stage-board');if(dashboard&&!dashboard.querySelector('[data-spiral-entry]')){const button=document.createElement('button');button.type='button';button.className='dashboard-stage-card level-card';button.dataset.spiralEntry='true';button.onclick=openSpiralMap;button.innerHTML='<span class="stage-badge">CURRICULUM</span><span class="stage-emoji">🌀</span><span class="level-title">나선형 배움</span><span class="level-desc">초등 1~6학년 수학</span><span class="stage-note">4개 영역 · 3개 학년군 · 개념별 성장 지도</span>';dashboard.appendChild(button);}const tray=document.getElementById('rpg-action-tray');if(tray&&!tray.querySelector('[data-spiral-entry]')){const button=document.createElement('button');button.className='rpg-action-button rpg-math-button';button.dataset.spiralEntry='true';button.onclick=openSpiralMap;button.innerHTML='<span class="rpg-action-icon">🌀</span><span>나선형 배움</span>';tray.appendChild(button);}}
document.addEventListener('DOMContentLoaded',installEntryPoints);setTimeout(installEntryPoints,800);
