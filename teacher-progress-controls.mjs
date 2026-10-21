// Personal student data only. Shared word cards/questions, wallet and reward receipts are never deleted.
export const PROGRESS_ACTIONS = Object.freeze({
    'shape-game': ['도형 동물원 성공률 초기화', 'drawing', 'shape-zoo'],
    'shape-accuracy': ['도형별 정확도 초기화', 'drawing'],
    'hangul-reset': ['한글 해득 진도 초기화', 'hangul'],
    'hangul-set': ['한글 해득 진도 설정', 'hangul'],
    'writing-game': ['쓰기 게임 성공률 초기화', 'hangul', 'dictation-asteroid'],
    'vocabulary-game': ['어휘 게임 성공률 초기화', 'dictation', 'word-card-table'],
    'dictation-reset': ['교과 맞춤쓰기 초기화', 'dictation'],
    'literacy-reset': ['문해력 단·정답률 초기화', 'literacy'],
    'detective-game': ['문해력 탐정단 성공률 초기화', 'literacy', 'literacy-detective'],
    'word-delete': ['단어 삭제', 'words'],
    'wrong-delete': ['오답 문항 삭제', 'dictation']
});
const arr = v => Array.isArray(v) ? v : [];
const wordOf = v => String(typeof v === 'string' ? v : v?.word || '').trim();
export function teacherStudentWords(data = {}) {
    const p = data.dictationPortfolio || {};
    return [...new Set([...arr(p.koreanBank?.words).map(wordOf), ...Object.keys(p.koreanBank?.wordStats || {}), ...Object.keys(p.curricularWriting?.wordStats || {})].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
}
export function wrongItemKey(item) { return String(item?.id || item?.sentence || item?.word || ''); }
export function buildTeacherProgressPatch(data, action, args = {}) {
    if (!Object.hasOwn(PROGRESS_ACTIONS, action)) throw new Error('지원하지 않는 관리 항목입니다.');
    const game = PROGRESS_ACTIONS[action][2], p = data.dictationPortfolio || {};
    if (game) {
        const zero = { successes:0, attempts:0, plays:0, recentRunIds:[], lastPlayedAt:null };
        return { [`koreanStageGameStats.${game}`]:zero, [`koreanProgressSummary.gameStats.${game}`]:zero };
    }
    if (action === 'shape-accuracy') return { 'drawingPortfolio.shapeStats':{} };
    if (action === 'hangul-reset') return { currentLearningStep:-1 };
    if (action === 'hangul-set') {
        const next = Number(args.step);
        if (!Number.isInteger(next) || next < 1 || next > 34) throw new Error('배움 1~33 또는 전체 완료를 선택해 주세요.');
        return { currentLearningStep:next - 1 };
    }
    if (action === 'literacy-reset') return { literacyDan:1, 'literacyPortfolio.dan':1, 'literacyPortfolio.stats':{}, 'literacyPortfolio.history':[] };
    if (action === 'dictation-reset') return {
        currentDictationStep:-1,
        'dictationPortfolio.missions':{}, 'dictationPortfolio.wrongBank':[], 'dictationPortfolio.completedBank':[],
        'dictationPortfolio.captures':[], 'dictationPortfolio.dictationLocked':true, 'dictationPortfolio.hasCompletedOnce':false,
        'dictationPortfolio.koreanBank.wordStats':{}, 'dictationPortfolio.koreanBank.syllableStats':{},
        'dictationPortfolio.curricularWriting':{ activeWords:[], photoWords:[], reviewWords:[], totalRounds:0, dan:1, stepStats:{}, wordStats:{}, syllableStats:{}, syllableBank:{stats:{}}, history:[], drafts:[], activeRoundId:'', photoCapturedAt:'', roundReadyFromPhoto:false, rewardedSessions:arr(p.curricularWriting?.rewardedSessions) }
    };
    if (action === 'wrong-delete') {
        const key = String(args.key || '');
        if (!key || !arr(p.wrongBank).some(x=>wrongItemKey(x)===key)) throw new Error('이미 제거되었거나 찾을 수 없는 오답입니다.');
        return { 'dictationPortfolio.wrongBank':arr(p.wrongBank).filter(x=>wrongItemKey(x)!==key) };
    }
    const word = String(args.word || '').trim();
    if (!word || !teacherStudentWords(data).includes(word)) throw new Error('이미 제거되었거나 찾을 수 없는 단어입니다.');
    const bank = {...(p.koreanBank || {})}, c = {...(p.curricularWriting || {})};
    bank.words = arr(bank.words).filter(x=>wordOf(x)!==word);
    bank.wordStats = {...(bank.wordStats || {})}; delete bank.wordStats[word];
    c.wordStats = {...(c.wordStats || {})}; delete c.wordStats[word];
    for (const k of ['activeWords','photoWords','reviewWords']) c[k] = arr(c[k]).filter(x=>wordOf(x)!==word);
    return { 'dictationPortfolio.koreanBank':bank, 'dictationPortfolio.curricularWriting':c, 'dictationPortfolio.aiWords':arr(p.aiWords).filter(x=>wordOf(x)!==word) };
}

export function createTeacherProgressControls({ document, window, escapeHtml:esc, getStudent, mutate, showModal }) {
    let view = null, pending = false, search = '';
    const button = (action, label=PROGRESS_ACTIONS[action][0]) => `<button type="button" class="teacher-progress-action" data-progress-action="${action}">${esc(label)}</button>`;
    function toolbar(sid, type) {
        view = {sid,type};
        const buttons = Object.entries(PROGRESS_ACTIONS).filter(([k,v])=>v[1]===type && !['hangul-set','wrong-delete'].includes(k)).map(([k])=>button(k)).join('');
        const step = Math.min(34,Math.max(1,Number(getStudent(sid)?.currentLearningStep || 0)+1));
        return `<section class="teacher-progress-toolbar" aria-label="학생 진도 관리">${buttons}${type==='hangul' ? `<label>할 차례 <select id="teacher-hangul-step">${Array.from({length:34},(_,i)=>`<option value="${i+1}" ${step===i+1?'selected':''}>${i===33?'전체 33배움 완료':`배움 ${i+1}`}</option>`).join('')}</select></label>${button('hangul-set','진도 설정')}`:''}<p>선택한 학생의 해당 기록만 변경합니다. 돈·경험치·다른 단계 기록은 유지합니다.</p></section>`;
    }
    function bank(sid, keepSearch=false) {
        if (!keepSearch) search=''; view={sid,type:'words'};
        const student=getStudent(sid); if(!student) return;
        const words=teacherStudentWords(student);
        showModal(`<section class="teacher-student-bank"><h3>${esc(student.name || '학생')} · 단어은행</h3><label for="teacher-bank-search">단어 검색</label><input id="teacher-bank-search" type="search" placeholder="찾을 단어를 입력하세요" value="${esc(search)}" autocomplete="off"><p id="teacher-bank-count" role="status"></p><div id="teacher-bank-words" class="teacher-bank-scroll"></div></section>`,{plainClose:true,hideIcon:true});
        renderWords(words);
        const input=document.getElementById('teacher-bank-search'); input?.addEventListener('input',()=>{search=input.value;renderWords(teacherStudentWords(getStudent(sid)));});
    }
    function renderWords(words) {
        const filtered=words.filter(w=>w.normalize('NFKC').toLowerCase().includes(search.trim().normalize('NFKC').toLowerCase()));
        document.getElementById('teacher-bank-count').textContent=`전체 ${words.length}개 · 검색 ${filtered.length}개`;
        document.getElementById('teacher-bank-words').innerHTML=filtered.length ? filtered.map(w=>`<article class="teacher-bank-card"><strong>${esc(w)}</strong><button type="button" data-progress-action="word-delete" data-word="${esc(w)}" aria-label="${esc(w)} 삭제">×</button></article>`).join(''):'<p class="teacher-bank-empty">해당하는 단어가 없습니다.</p>';
    }
    function wrongCards(student) {
        return `<section class="teacher-wrong-bank"><h4>오답 문항</h4>${arr(student.dictationPortfolio?.wrongBank).map(item=>`<article class="teacher-bank-card"><strong>${esc(item.sentence || item.word || '오답')}</strong><button type="button" data-progress-action="wrong-delete" data-key="${esc(wrongItemKey(item))}" aria-label="오답 문항 삭제">×</button><p>오답 ${Number(item.wrongCount || 0)}회 · 정답 ${Number(item.correctCount || 0)}회</p></article>`).join('') || '<p>오답 문항이 없습니다.</p>'}</section>`;
    }
    document.addEventListener('click', async event=>{
        const target=event.target.closest?.('[data-progress-action]');
        if(!target || !view || !document.getElementById('result-modal')?.contains(target) || pending) return;
        const action=target.dataset.progressAction; if(!Object.hasOwn(PROGRESS_ACTIONS,action)) return;
        const selected={...view}, args={word:target.dataset.word,key:target.dataset.key,step:document.getElementById('teacher-hangul-step')?.value};
        const student=getStudent(selected.sid); if(!student) return;
        // Native confirm supports Enter, Escape and Cancel without unsafe HTML or shared modal handlers.
        const detail=action==='word-delete'?`‘${args.word}’ 단어를 정말 없애시겠습니까?`:action==='wrong-delete'?'이 오답 문항을 정말 없애시겠습니까?':`${PROGRESS_ACTIONS[action][0]}${action==='hangul-set'?` (선택: ${args.step==='34'?'전체 완료':`배움 ${args.step}`})`:''} 하시겠습니까?`;
        if(!window.confirm(`${student.name || '학생'}\n${detail}\n이 변경은 되돌릴 수 없습니다.`)) return;
        pending=true;target.disabled=true;
        try {
            await mutate(selected.sid,action,args);
            if(view?.sid!==selected.sid || view?.type!==selected.type) return;
            if(selected.type==='words') bank(selected.sid,true); else window.openStudentProgressDetail(selected.sid,selected.type);
        } catch(error) { window.alert(error?.message || '학생 기록 변경에 실패했습니다.'); }
        finally {pending=false;if(target.isConnected)target.disabled=false;}
    });
    return {toolbar,bank,wrongCards};
}
