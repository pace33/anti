export const STAGE_TUTORIALS = Object.freeze({
    1: { name: '그리기', route: 'drawing', section: 'drawing-activities-section' },
    2: { name: '한글 해득', route: 'hangul', section: 'hangul-activities-section' },
    3: { name: '교과 맞춤쓰기', route: 'dictation', section: 'dictation-activities-section' },
    4: { name: '문해력', route: 'literacy', section: 'literacy-activities-section' }
});

export function buildStageTutorial(level, role) {
    if (!STAGE_TUTORIALS[level] || !['teacher', 'student'].includes(role)) throw new Error('지원하지 않는 단계 안내예요.');
    const teacher = role === 'teacher', info = STAGE_TUTORIALS[level];
    const steps = [];
    function line(id, view, student, teaching, targets = [], click = null, practice = null) {
        steps.push({ id: `stage-${level}-${id}`, view, text: teacher ? teaching : student, targets,
            pose: practice ? 'think' : 'welcome', ...(click ? { click: id, clickLabel: click } : {}),
            ...(practice ? { practice, click: 'practice' } : {}) });
    }
    const target = handler => `#${info.section} [onclick="${handler}"]`;
    line('enter', 'dashboard',
        `${level}단계 ${info.name}에 처음 왔구나! 에이두와 천천히 해 보자. 밝은 단계 카드를 눌러 줘. 연습은 기록이나 포인트에 남지 않아.`,
        `${level}단계 ${info.name}를 함께 살펴보겠습니다. 학생이 직접 하는 짧은 연습과 수업에서 관찰할 점을 안내해 드릴게요. 단계 카드를 눌러 주세요.`,
        [`#card-level-${level}`], `${level}단계`);
    if (level === 1) {
        line('mission', 'hub', '그림 미션은 보고 따라 그리는 곳이야. 먼저 시작점을 보고, 손가락이나 펜을 천천히 움직여 보자. 그림 미션을 눌러 줘.',
            '1단계는 화면을 보고 손을 움직이는 연습과 활동 습관을 쌓는 단계입니다. 결과의 예쁨보다 시작·멈춤과 끝까지 시도하는 과정을 관찰해 주세요. 그림 미션을 눌러 보세요.',
            [target('openCurrentDrawingMission()')], '그림 미션');
        line('line', 'drawing-workspace-section', '초록 점에서 시작해서 오른쪽 끝까지 선을 그어 봐. 벗어나도 괜찮아. 다시 시작할 수 있어!',
            '학생 역할로 선을 따라 그어 보세요. 시작점을 짚어 주고 기다려 주세요. 손 사용이 어려우면 아래 ‘점으로 따라가기’로도 순서와 방향을 연습할 수 있습니다.', [], null, 'trace-line');
        line('tools', 'drawing-workspace-section', '색과 붓 크기를 고를 수 있고, 지우개로 고칠 수도 있어. 처음부터 완벽하게 그리지 않아도 괜찮아.',
            '색·붓 크기·지우개가 있습니다. 처음에는 선택지를 줄이고, 익숙해지면 학생이 도구를 고르게 해 주세요. 실수는 수정할 기회로 다뤄 주세요.', ['#drawing-brush-size-buttons', '#drawing-eraser-btn']);
        line('shape', 'hub', '이번에는 도형 미션이야. 꼭짓점을 차례로 이으면 어떤 모양이 될까? 눌러서 같이 해 보자.',
            '도형 미션에서는 꼭짓점과 선의 방향을 살펴봅니다. “여기서 어디로 갈까?”라고 묻고 학생이 먼저 가리키게 해 주세요.', [target('openTodayDrawingActivity()')], '도형 미션');
        line('triangle', 'drawing-workspace-section', '1, 2, 3, 다시 1! 점을 차례대로 눌러 세모를 만들어 보자.',
            '점을 1→2→3→1 순서로 이어 보세요. 닫힌 도형이 되는 과정을 말로 함께 표현하면 순서와 모양을 연결할 수 있습니다.', [], null, 'triangle');
        line('records', 'hub', '내가 만든 그림은 ‘나의 그림’에서 다시 볼 수 있어. 한 번 들어가 보자.',
            '나의 그림에서 이전 결과와 최근 결과를 함께 살펴보세요. 다른 학생과 비교하기보다 선의 방향이나 스스로 한 부분의 변화를 찾아 주세요.', [target('openMyDrawingFromDashboard()')], '나의 그림');
        line('gallery', 'my-drawing-section', '그림이 아직 없어도 괜찮아. 실제 미션을 하고 저장하면 여기에 모여. 다음에는 어떤 그림을 그리고 싶니?',
            '아직 기록이 없으면 실제 활동 후 확인할 수 있습니다. “오늘은 시작점을 혼자 찾았네”처럼 구체적인 행동을 피드백해 주세요.', ['#my-drawing-section .drawing-brand-context']);
        line('sketchbook', 'hub', 'AI 스케치북에서는 그리고 싶은 것을 자유롭게 표현할 수 있어. 그림 미션에 익숙해진 뒤 선생님과 함께 써 보자.',
            'AI 스케치북은 자유로운 표현을 확장하는 기능입니다. 무엇을 그렸는지 먼저 학생에게 듣고, 생성된 결과와 자신의 생각을 비교하도록 도와주세요.', [target('openSketchbookActivity()')]);
    } else if (level === 2) {
        line('today', 'hub', '오늘의 한글은 내 차례에 맞는 공부를 이어가는 곳이야. 소리를 듣고 글자를 보며 조금씩 배워 가자.',
            '오늘의 한글은 학습 순서에 맞춰 이어갑니다. 글자 이름 외우기에만 머물지 않도록, 소리를 듣고 글자와 연결한 뒤 읽고 쓰는 활동을 연결해 주세요.', [target('openTodayKoreanActivity()')]);
        line('cards', 'hub', '한글 카드를 눌러 보자. 그림과 낱말을 보고 소리를 들어 볼 수 있어.',
            '한글 카드로 의미와 소리를 연결해 보겠습니다. 학생에게 먼저 그림을 말하게 하고, 소리를 들은 뒤 글자를 짚게 해 주세요.', [target('openReadingPracticeActivity()')], '한글 카드');
        line('categories', 'reading', '받침 없는 낱말부터 차근차근 볼 수 있어. 어려운 낱말은 다시 듣고 천천히 읽어도 돼.',
            '받침 없는 낱말·복잡한 모음·받침 낱말로 나뉩니다. 정답 수만 보지 말고 어떤 소리나 글자에서 혼동하는지 확인해 묶음을 선택해 주세요.', ['#reading-category-tabs']);
        line('sound', 'reading', '소리 듣기를 누르고 ‘가’를 찾아보자. 소리가 안 들리면 화면의 글자를 보고 골라도 괜찮아.',
            '‘가’를 듣고 고르는 연습입니다. 틀리면 곧바로 답을 대신 말하기보다, ㄱ과 모음의 모양을 다시 비교하도록 안내해 주세요.', [], null, 'sound');
        line('writing', 'hub', '이번에는 쓰기 연습을 눌러 보자. 글자를 보고, 소리 내어 읽고, 손으로 써 보는 거야.',
            '쓰기 연습으로 이동합니다. 많이 쓰기보다 글자를 보고 소리를 말한 뒤 방향에 맞춰 한 번 써 보는 과정을 확인해 주세요.', [target('openLetterWritingActivity()')], '쓰기 연습');
        line('stroke', 'letter-writing-section', 'ㄱ을 써 보자. 왼쪽에서 오른쪽으로 간 다음, 아래로 내려오면 돼. 천천히 따라 해 봐!',
            'ㄱ의 꺾이는 방향을 따라 써 보세요. 시작점과 방향을 한 가지씩 안내하고, 학생이 스스로 해 볼 시간을 줍니다. 점 누르기 방식도 선택할 수 있습니다.', [], null, 'trace-letter');
        line('review', 'hub', '나의 한글에서 배운 내용을 다시 볼 수 있어. 잘 안 떠오르는 글자는 다시 해도 괜찮아. 눌러 볼까?',
            '나의 한글에서 학습 순서를 확인해 주세요. 읽기와 쓰기 수행은 다를 수 있으니, 익숙한 것과 도움이 필요한 것을 나눠 짧게 복습합니다.', [target('openMyKoreanFromDashboard()')], '나의 한글');
        line('progress', 'my-korean-section', '처음부터 다 할 필요는 없어. 오늘 배운 것 중 한 가지를 다시 읽어 보며 마무리하자.',
            '완료 표시는 학습 이력입니다. 실제로 읽을 수 있는지는 짧게 다시 확인해 주세요. 정확히 읽은 뒤에는 새로운 낱말에서도 같은 글자를 찾아봅니다.', ['#my-korean-section']);
    } else if (level === 3) {
        line('mission', 'hub', '교과 맞춤쓰기는 수업이나 생활에서 만난 낱말을 읽고 쓰는 곳이야. 눌러서 예시로 해 보자.',
            '3단계는 알고 있는 글자를 교과·생활 어휘로 넓히는 단계입니다. 학생이 이미 경험한 소재로 시작해 의미 확인과 읽기·쓰기를 연결해 주세요.', ['#dictation-mission-card'], '교과 맞춤쓰기');
        line('collect', 'dictation-workspace-section', '예시 노트에서 먹을 수 있는 것을 찾아 눌러 줘. 실제로는 노트 사진에서 공부할 낱말을 모을 수 있어.',
            '예시 노트에서 음식 낱말을 골라 보세요. 실제 사진을 사용할 때는 글자가 또렷한지와 추출된 낱말이 맞는지 함께 확인하고, 의미를 아는지 먼저 물어봐 주세요.', [], null, 'collect');
        line('build', 'dictation-workspace-section', '사과를 말해 보고, ‘사’ 다음 ‘과’를 눌러 낱말을 만들어 보자.',
            '그림의 이름을 말한 뒤 ‘사·과’를 차례로 조합합니다. 음절을 빠뜨리면 천천히 나누어 말하게 하고 글자 수와 연결해 주세요.', [], null, 'build');
        line('write', 'dictation-workspace-section', '이번에는 ‘사과’를 직접 입력해 보자. 쓰기 어려우면 글자 버튼을 차례로 눌러도 돼.',
            '낱말을 다시 보며 입력해 보세요. 이 체험은 입력 방식이지만 실제 학습에서는 읽기와 손글씨 쓰기도 이어집니다. 정확한 낱말을 확인한 뒤 도움을 조금씩 줄여 주세요.', [], null, 'write');
        line('bank', 'hub', '모은 낱말은 단어 은행에서 볼 수 있어. 눌러서 확인해 보자.',
            '단어 은행은 노트에서 모은 어휘를 살펴보는 곳입니다. 단어를 많이 모으기보다 수업에서 사용할 핵심 낱말을 정하고 반복해서 써 보게 해 주세요.', [target('openDictationBankModal()')], '단어 은행');
        line('bank-view', 'bank', '아직 낱말이 없으면 실제 노트 활동을 한 뒤 다시 와 보자. 아는 낱말로 짧은 문장을 말해 보는 것도 좋아.',
            '학습한 어휘의 기록을 확인할 수 있습니다. “이 낱말로 오늘 있었던 일을 말해 볼까?”처럼 실제 맥락으로 확장해 주세요.', ['.dictation-bank-modal-shell']);
        line('retry', 'hub', '교과 맞춤쓰기 연습하기에서는 다시 연습할 수 있어. 틀린 낱말은 정답을 보고 읽은 다음 다시 써 보자.',
            '연습하기로 오답 단어·문장을 다시 다룹니다. 틀린 답을 반복해서 쓰게 하기보다 정확한 형태를 확인하고, 다음에는 도움 없이 해 보는 기회를 주세요.', [target('openDictationPracticeActivity()')]);
        line('records', 'hub', '나의 기록을 눌러 보자. 실제로 연습한 낱말과 내가 해낸 내용을 다시 볼 수 있어.',
            '나의 기록을 열어 학습 흐름을 살펴보세요. 오답의 원인이 뜻을 모르는 것인지, 읽기인지, 쓰기인지 구분하면 다음 도움을 정하기 쉽습니다.', [target('openMyDictationFromDashboard()')], '나의 기록');
        line('record-view', 'my-dictation-section', '같은 낱말도 다시 만나면 더 익숙해져. 오늘 배운 낱말을 교실이나 집에서도 찾아보자.',
            '학생이 배운 어휘를 실제 대화나 문장에서 사용하는지 확인해 주세요. 한 번 맞힌 결과보다 다른 상황으로 옮겨 쓸 수 있는지가 중요합니다.', ['#my-dictation-section']);
    } else {
        line('mission', 'hub', '문해력 문제에서는 글을 읽고 뜻을 생각해. 문제를 눌러서 짧은 글부터 함께 읽어 보자.',
            '4단계는 글 속 정보와 근거를 찾아 이해하는 단계입니다. 빨리 읽기보다 질문을 이해하고, 답의 근거를 지문에서 찾는 과정을 관찰해 주세요.', ['#literacy-mission-card'], '문해력 문제');
        line('read', 'literacy-workspace-section', '짧은 글을 읽거나 소리로 들어 보자. 지우가 무엇을 챙겼는지 생각하며 읽어 줘.',
            '짧은 예시 지문을 읽어 보세요. 읽기 부담이 크면 듣기를 함께 사용하되, 학생이 이해한 내용을 자신의 말로 표현하도록 기다려 주세요.', [], null, 'read');
        line('literal', 'literacy-workspace-section', '지우는 무엇을 챙겼을까? 기억이 안 나면 글을 다시 읽어도 돼.',
            '먼저 지문에 직접 나온 정보를 찾습니다. 다시 읽는 것은 좋은 전략입니다. 정답만 재촉하기보다 해당 문장을 짚게 해 주세요.', [], null, 'literal');
        line('infer', 'literacy-workspace-section', '지우가 우산을 챙긴 까닭은 뭘까? 글 속 단서를 생각하며 골라 보자.',
            '이번에는 단서로 이유를 추론합니다. 글에 없는 내용을 무작정 상상하기보다, 단서와 답이 어떻게 이어지는지 말하게 해 주세요.', [], null, 'infer');
        line('evidence', 'literacy-workspace-section', '왜 그렇게 생각했는지 알려 주는 문장을 눌러 줘. 답을 찾을 때는 글 속 근거도 함께 찾아보자!',
            '추론을 뒷받침하는 문장을 선택해 보세요. “어느 문장을 보고 알았니?”라는 질문은 학생의 이해 과정을 확인하는 데 도움이 됩니다.', [], null, 'evidence');
        line('bank', 'hub', '단어 은행의 낱말은 읽기에서도 다시 만날 수 있어. 아는 낱말이 나오면 글의 뜻을 이해하기 더 쉬워져.',
            '3단계에서 모은 어휘를 문해력 활동과 연결합니다. 읽기 전에 낯선 핵심 낱말을 짧게 확인하되, 지문의 답을 미리 알려주지는 않도록 해 주세요.', [target('openDictationBankModal()')]);
        line('challenge', 'hub', '한계 돌파는 어려웠던 문제에 다시 도전하는 곳이야. 지금 어렵다면 쉬었다가 선생님과 함께 해도 돼.',
            '한계 돌파는 추가 도전으로 활용합니다. 좌절이 커지면 난이도보다 지원 방법을 먼저 조정하고, 근거를 찾는 과정을 다시 보여 주세요.', ['#literacy-limit-break-card']);
        line('records', 'hub', '나의 기록에서 실제로 풀었던 내용을 볼 수 있어. 어떤 문제였는지 함께 확인해 보자.',
            '나의 기록에서 유형별 학습 결과를 살펴보세요. 정답률뿐 아니라 사실 찾기·추론·표현 중 어떤 과정에서 도움이 필요한지 관찰과 함께 해석합니다.', [target('openMyLiteracyRecord()')], '나의 기록');
        line('record-view', 'literacy-record', '오늘 연습처럼 다시 읽고, 단서를 찾고, 까닭을 말하면 돼. 틀렸을 때도 글로 돌아가 보자!',
            '기록이 아직 없다면 실제 활동 뒤 확인할 수 있습니다. 마지막에는 학생이 답의 이유를 한 문장으로 설명하도록 해 주세요.', ['#modal-message']);
    }
    line('finish', 'hub', '잘 해 봤어! 이제 한 가지 활동을 골라 천천히 시작하자. 다시 보고 싶으면 홈의 ‘처음 해봐요’를 눌러 줘.',
        '안내를 마쳤습니다. 학생이 스스로 할 수 있는 작은 목표 하나로 시작하고, 필요한 도움은 점차 줄여 주세요. 홈의 ‘처음 해봐요’에서 다시 볼 수 있습니다.');
    return steps;
}

export const TUTORIAL_PASSAGE = ['지우는 창밖의 빗방울을 보았어요.', '지우는 우산을 챙겨 학교에 갔어요.'];
export function isTutorialAnswer(kind, answer) {
    return ({ sound: '가', collect: '사과', literal: '우산', infer: '비가 와서', evidence: TUTORIAL_PASSAGE[0] })[kind] === answer;
}
export function isTutorialWord(value) { return String(value).normalize('NFC').trim() === '사과'; }
export function tracePoints(kind) { return kind === 'trace-letter' ? [[80, 50], [280, 50], [280, 155]] : [[55, 100], [305, 100]]; }
export function nearPoint(a, b, radius = 32) { return Math.hypot(a[0] - b[0], a[1] - b[1]) <= radius; }
