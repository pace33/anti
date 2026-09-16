export const STAGE_TUTORIALS = Object.freeze({
    1: { name: '그리기', route: 'drawing', section: 'drawing-activities-section' },
    2: { name: '한글 해득', route: 'hangul', section: 'hangul-activities-section' },
    3: { name: '교과 맞춤쓰기', route: 'dictation', section: 'dictation-activities-section' },
    4: { name: '문해력', route: 'literacy', section: 'literacy-activities-section' }
});

// Every destination is opened by the same screen initializer used by the app.
// Only data needed for an otherwise empty, generated activity uses a labelled sample.
export function buildStageTutorial(level, role) {
    const info = STAGE_TUTORIALS[level];
    if (!info || !['teacher', 'student'].includes(role)) throw new Error('지원하지 않는 단계 안내예요.');
    const steps = [], teacher = role === 'teacher';
    const selector = handler => `#${info.section} [onclick="${handler}"]`;
    const add = (id, view, targets, student, teaching, extra = {}) => steps.push({
        id: `stage-${level}-${id}`, view, targets, pose: 'welcome', text: teacher ? teaching : student, ...extra
    });
    const enter = (id, label, handler, view, student, teaching) => add(id, 'hub', [handler.startsWith('#') ? handler : selector(handler)], student, teaching, { click: id, clickLabel: label, destination: view });
    const press = (id, view, target, label, student, teaching) => add(id, view, [target], student, teaching, { click: id, clickLabel: label, press: target });
    const explore = (id, view, targets, student, teaching, interact = [], event = 'click') => add(id, view, targets, student, teaching,
        interact.length ? { interact, event, click: 'explore', clickLabel: '체험' } : {});
    add('enter', 'dashboard', [`#card-level-${level}`],
        `${level}단계 ${info.name}! 실제 버튼을 누르며 하나씩 둘러보자. ${level}단계 버튼을 눌러 주세요.`,
        `${level}단계 ${info.name}의 실제 화면을 함께 사용해 보겠습니다. ${level}단계 버튼을 눌러 주세요.`,
        { click: 'enter', clickLabel: `${level}단계`, destination: 'hub' });
    if (level === 1) {
        enter('drawing', '그림 미션', 'openCurrentDrawingMission()', 'drawing', '‘그림 미션’을 눌러 보자. 지금 할 차례인 그림이 열려.', '그림 미션은 학생의 진행 단계에 맞는 도안을 엽니다. 직접 눌러 현재 제시되는 그림을 확인해 주세요.');
        explore('drawing-look', 'drawing', ['#drawing-canvas'], '이게 실제 그림판이야. 제시된 그림의 선과 모양을 먼저 살펴보자. 이번 안내에서는 그려 보기만 하고 기록은 저장하지 않아.', '실제 도안과 그림판입니다. 시작 전에 학생이 선의 방향과 모양을 눈으로 살피게 해 주세요. 안내 중에는 저장·완료 처리를 하지 않습니다.');
        explore('color', 'drawing', ['#drawing-color-palette'], '색 버튼을 하나 눌러 골라 줘. 어떤 색으로 그릴까?', '색상 팔레트에서 한 가지 색을 선택해 보세요. 선택하기 자체도 학생이 스스로 결정하는 연습입니다.', ['#drawing-color-palette button']);
        explore('brush', 'drawing', ['#drawing-brush-size-buttons'], '이번에는 붓 크기 숫자를 눌러 봐. 큰 숫자를 고르면 더 굵게 그릴 수 있어.', '붓 크기를 바꿔 보세요. 학생의 손 조절 정도와 도안 크기에 맞게 선 굵기를 조정할 수 있습니다.', ['#drawing-brush-size-buttons button']);
        explore('draw', 'drawing', ['#drawing-canvas'], '그림판에 손가락이나 펜을 대고 선을 그어 봐. 조금 그린 뒤 ‘체험 마치고 계속’을 눌러 줘.', '실제 그림판에 선을 그어 보세요. 처음에는 짧은 선 하나처럼 작은 과제를 제시하고 시작과 멈춤을 살펴보세요.', ['#drawing-canvas'], 'stroke');
        press('eraser', 'drawing', '#drawing-eraser-btn', '지우개', '지우개를 눌러 보자. 그린 선을 고칠 수 있어.', '지우개를 켜 보세요. 실수를 지우고 수정하는 도구입니다.');
        explore('erase', 'drawing', ['#drawing-canvas'], '방금 그린 선 위를 문질러 지워 봐. 틀려도 이렇게 고칠 수 있어!', '그린 선 일부를 지워 보세요. 학생이 수정한 뒤 다시 시도할 수 있도록 기다려 주세요.', ['#drawing-canvas'], 'stroke');
        explore('complete-button', 'drawing', ['#drawing-complete-mission-btn'], '실제 미션을 끝냈을 때는 ‘완료하기’를 눌러 확인받아. 이제 다른 그리기 버튼도 살펴보자.', '실제 수업에서는 완료하기로 미션 결과를 확인합니다. 여기서는 버튼의 위치를 확인하고 다음 활동으로 이동합니다.');
        enter('shape', '도형 미션', 'openTodayDrawingActivity()', 'shape', '‘도형 미션’을 눌러 보자. 이번에는 도형을 그리는 그림판이 열려.', '도형 미션을 열어 보세요. 그림 미션과 구분하여 도형의 윤곽을 따라 그리는 활동입니다.');
        explore('shape-draw', 'shape', ['#drawing-canvas'], '나온 도형을 보고 선을 조금 따라 그려 보자. 꺾이는 곳과 둥근 곳이 어디일까?', '제시된 도형의 선을 그어 보세요. 꼭짓점에서 방향이 바뀌는지, 곡선을 따라 움직이는지 관찰할 수 있습니다.', ['#drawing-canvas'], 'stroke');
        enter('mine', '나의 그림', 'openMyDrawingFromDashboard()', 'drawings', '‘나의 그림’을 눌러 보자. 내가 진행한 그림 미션을 볼 수 있어.', '나의 그림을 열어 진행 단계와 저장된 결과를 확인해 보세요.');
        explore('mine-view', 'drawings', ['#my-drawing-mission-list'], '미션별 기록이 여기에 모여. 아직 기록이 없다면 실제 그림 미션을 마친 뒤 다시 확인해 보자.', '목록에서 미션의 진행 상태를 확인합니다. 기록이 없을 때는 학생이 첫 미션을 수행한 뒤 다시 확인해 주세요.');
        enter('friends', '친구들 그림', 'openFriendsDrawingGallery()', 'friends', '이번엔 ‘친구들 그림’을 눌러 다른 작품을 구경하자.', '친구들 그림을 열어 작품 감상 화면을 살펴보세요.');
        explore('friends-view', 'friends', ['#modal-message'], '그림이 보이면 마음에 드는 색이나 모양을 찾아봐. 아직 작품이 없으면 다음에 다시 보자.', '작품이 있으면 “누가 더 잘했니?”보다 “어떤 색과 모양을 썼니?”라고 물어보세요. 저장된 작품이 없으면 빈 목록이 표시됩니다.');
        enter('sketch', 'AI 스케치북', 'openSketchbookActivity()', 'sketch', '‘AI 스케치북’을 눌러 보자. 이번에는 내가 그리고 싶은 그림을 그려.', 'AI 스케치북을 열어 자유롭게 그리는 화면을 살펴보겠습니다.');
        explore('sketch-draw', 'sketch', ['#drawing-canvas'], '그림판에 생각나는 모양을 그려 봐. 완성된 그림을 AI가 어떻게 바꾸면 좋을지도 생각해 보자.', '실제 그림판에 간단한 모양을 그려 보세요. AI 결과를 보기 전에 학생이 표현하려던 것을 먼저 말하게 해 주세요.', ['#drawing-canvas'], 'stroke');
        explore('sketch-ai', 'sketch', ['#drawing-ai-generate-btn'], '‘AI 생성’은 내 그림을 바탕으로 새 그림을 만드는 버튼이야. 실제로 사용할 때는 그림을 그린 다음 눌러 줘.', 'AI 생성은 학생이 그린 그림을 바탕으로 결과를 만드는 기능입니다. 이 안내에서는 생성 버튼의 위치까지 살펴봅니다.');
        enter('zoo', '도형 동물원', '#stage-1-game-shape', 'zoo', '‘도형 동물원’도 눌러 보자. 도형 그리기를 게임으로 만날 수 있어.', '도형 동물원에 들어가 게임의 시작 화면과 규칙을 확인해 주세요.');
        explore('zoo-view', 'zoo', ['#zoo-overlay'], '사자가 원하는 도형을 점선 따라 그리고 과자를 주는 게임이야. 제한 시간과 생명이 있으니 규칙을 먼저 읽어 보자.', '시작 화면에서 제한 시간·생명·도형 완성 규칙을 확인합니다. 기본 그리기에 익숙해진 학생에게 활용해 주세요.');
    } else if (level === 2) {
        enter('today', '오늘의 한글', 'openTodayKoreanActivity()', 'today', '‘오늘의 한글’을 눌러 보자. 내 차례인 배움으로 들어가는 버튼이야.', '오늘의 한글을 열어 학생의 다음 배움이 어디에서 시작되는지 확인해 주세요.');
        explore('today-view', 'today', ['#learning-detail-content'], '지금 할 배움이 이 화면에 나와. 안내에 따라 활동한 다음 ‘다음으로’ 이어가면 돼. 배움을 모두 끝냈다면 첫 배움 화면을 함께 살펴볼 거야.', '학생의 현재 진도에 따른 배움 화면입니다. 내용과 과제는 배움마다 달라집니다. 이미 모두 완료한 계정은 첫 배움을 둘러보도록 열었습니다.');
        enter('my-korean', '나의 한글', 'openMyKoreanFromDashboard()', 'korean', '‘나의 한글’을 눌러 전체 배움 목록을 보자.', '나의 한글에서 배움 목록과 학습 상태를 확인해 보세요.');
        explore('korean-view', 'korean', ['#my-korean-list'], '여기서 배움의 제목과 학습한 내용을 살펴볼 수 있어. 다시 볼 배움을 찾는 곳이야.', '목록에서 수업에 필요한 배움을 찾을 수 있습니다. 완료 여부와 실제 읽기·쓰기 수행을 함께 확인해 복습할 내용을 정해 주세요.');
        enter('cards', '한글 카드', 'openReadingPracticeActivity()', 'reading', '‘한글 카드’를 눌러 보자. 카드의 그림과 낱말을 보고 소리를 들을 수 있어.', '한글 카드를 열어 그림·낱말·소리를 연결하는 기능을 체험해 보세요.');
        press('basic', 'reading', '#reading-tab-basic', '받침 없는 낱말', '‘받침 없는 낱말’을 눌러 카드 묶음을 골라 보자.', '먼저 받침 없는 낱말 묶음을 선택합니다. 학생이 읽을 수 있는 범위부터 시작해 주세요.');
        explore('read-card', 'reading', ['#reading-cards-grid'], '밝은 카드 중 하나를 눌러 소리를 들어 봐. 그림의 이름을 같이 말해 보자.', '실제 그림 카드 하나를 눌러 소리를 들어 보세요. 학생이 먼저 이름을 말한 뒤 글자를 짚어 보게 할 수 있습니다.', ['#reading-cards-grid .reading-card']);
        press('slow', 'reading', '#reading-slow-toggle', '느리게 읽기', '‘느리게 읽기’를 눌러 켜 보자. 한 글자씩 천천히 들을 수 있어.', '느리게 읽기를 켭니다. 음절별로 글자가 강조되는 모습을 확인해 주세요.');
        explore('slow-card', 'reading', ['#reading-cards-grid'], '카드를 다시 눌러 봐. 이번에는 한 글자씩 소리를 듣고 따라 말해 보자.', '카드를 다시 눌러 음절별 읽기를 체험합니다. 소리의 순서와 글자의 순서를 연결할 때 사용할 수 있습니다.', ['#reading-cards-grid .reading-card']);
        press('complex', 'reading', '#reading-tab-complex', '복잡한 모음', '이번엔 ‘복잡한 모음’을 눌러 다른 낱말을 보자.', '복잡한 모음 묶음으로 바꿔 보세요. 학습한 모음이 포함된 낱말을 골라 복습할 수 있습니다.');
        press('batchim', 'reading', '#reading-tab-batchim', '받침 낱말', '‘받침 낱말’도 눌러 보자. 아는 글자가 있는지 찾아봐.', '받침 낱말 묶음도 확인해 주세요. 학생의 읽기 수준에 따라 카드 묶음을 바꿀 수 있습니다.');
        press('custom', 'reading', '#reading-tab-custom', '직접 만들기', '‘직접 만들기’를 누르면 내가 입력한 글로 읽기 카드를 만들 수 있어.', '직접 만들기 화면을 열어 수업에서 사용할 글자·문장을 입력하는 위치를 확인해 주세요.');
        explore('custom-view', 'reading', ['#reading-custom-maker'], '입력 칸에 읽어 보고 싶은 글을 적는 곳이야. 오늘 배운 낱말이나 내 이름으로 써볼 수 있어.', '이 화면에서 원하는 글을 입력해 음절별 읽기를 구성합니다. 학생의 이름이나 교실에서 쓰는 짧은 표현을 활용해 보세요.');
        press('custom-sample', 'reading', '#ssr-sample', '예시 바꾸기', '‘예시 바꾸기’를 눌러 실제 입력 칸과 음절 카드가 어떻게 바뀌는지 보자.', '예시 바꾸기를 눌러 입력한 글이 음절 카드로 나뉘는 모습을 확인해 주세요.');
        press('custom-play', 'reading', '#ssr-play', '천천히 읽기', '‘천천히 읽기’를 눌러 만들어진 카드를 순서대로 들어 보자.', '천천히 읽기를 눌러 입력한 글의 음절별 읽기를 체험해 보세요.');
        enter('writing', '쓰기 연습', 'openLetterWritingActivity()', 'writing', '‘쓰기 연습’을 눌러 실제 글자 쓰기 화면을 열자.', '쓰기 연습을 열어 글자·낱말·문장 탭을 차례대로 살펴보겠습니다.');
        press('letter-sound', 'writing', '#letter-play-sound', '소리 듣기', '먼저 소리 듣기를 누르고 어떤 글자인지 들어 보자.', '소리 듣기를 먼저 눌러 현재 제시된 글자와 소리를 연결해 주세요.');
        explore('letter-write', 'writing', ['#letter-writing-canvas'], '밝은 글자판에 손가락이나 펜을 대고 획을 따라 써 봐. 지금은 체험이라 경험치나 진도를 바꾸지 않아.', '실제 쓰기판에서 획순 안내를 따라 써 보세요. 안내 중 쓰기는 연습으로 처리되며 학습 기록과 경험치를 변경하지 않습니다.', ['#letter-writing-canvas'], 'stroke');
        press('clear-letter', 'writing', '#letter-clear', '다시 쓰기', '‘다시 쓰기’를 눌러 지워 보자. 같은 글자를 다시 연습할 수 있어.', '다시 쓰기를 눌러 같은 글자를 재시도하는 방법도 확인해 주세요.');
        press('word-tab', 'writing', '.letter-top-btn[data-category="word"]', '낱말 연습', '‘낱말 연습’을 눌러 보자. 글자 여러 개가 이어진 낱말을 쓰는 곳이야.', '낱말 연습 탭을 선택해 난이도 선택과 새 낱말 만들기 버튼을 확인해 주세요.');
        explore('word-view', 'writing', ['#letter-word-level-tabs', '#letter-generate-word'], '낱말 난이도를 고르고 ‘새 낱말 만들기’를 누르면 연습할 낱말이 바뀌어.', '난이도를 고른 뒤 새 낱말 만들기로 쓰기 대상을 바꿀 수 있습니다.');
        press('sentence-tab', 'writing', '.letter-top-btn[data-category="sentence"]', '문장 연습', '‘문장 연습’도 눌러 보자. 이번에는 문장 전체를 쓰는 곳이야.', '문장 연습 탭도 열어 보세요. 낱말 쓰기가 익숙해진 뒤 문장과 띄어쓰기를 살펴볼 때 활용합니다.');
        explore('sentence-view', 'writing', ['#letter-sentence-writing-canvas'], '문장을 먼저 읽고 차근차근 쓰면 돼. 글자·낱말·문장을 골라 연습할 수 있지!', '실제 문장 쓰기판입니다. 문장을 먼저 읽고 의미를 확인한 뒤 쓰기로 이어 주세요.');
        enter('sound-game', '한글 게임', 'openHangulGameActivity()', 'sound-game', '‘한글 게임’을 눌러 보자. 소리를 듣고 알맞은 카드를 고르는 게임이야.', '한글 게임을 열어 소리 듣기와 카드 선택 화면을 살펴보세요.');
        press('game-listen', 'sound-game', '#hangul-game-sound', '소리 듣기', '소리 듣기 버튼을 눌러 어떤 소리가 나오는지 들어 보자.', '소리 듣기를 눌러 문제 제시 방식을 확인해 주세요.');
        explore('game-view', 'sound-game', ['#hangul-game-choices'], '실제 게임에서는 들은 소리와 맞는 카드를 골라. 글자 모드와 낱말 모드가 있어.', '실제 게임에서는 보기 중 들은 소리에 맞는 카드를 고릅니다. 글자·낱말 모드를 학생 수준에 맞춰 사용해 주세요.');
        enter('space', '낱말 우주 방어대', '#stage-2-game-asteroid', 'space', '위쪽 ‘낱말 우주 방어대’도 열어 보자. 쓰기를 게임으로 연습하는 곳이야.', '상단 낱말 우주 방어대에 들어가 쓰기 게임의 준비 화면을 확인합니다.');
        explore('space-view', 'space', ['#dictation-asteroid-game-section'], '글자를 획순대로 써서 소행성을 막는 게임이야. 쓰기 연습이 익숙해지면 도전해 보자.', '획순대로 글자를 써서 소행성을 막는 게임입니다. 기본 쓰기 연습 이후 반복 활동으로 활용할 수 있습니다.');
    } else {
        enter('photo', '오늘의 노트 사진 찍기', `#${info.section} .lesson-photo-button`, 'photo', '먼저 ‘오늘의 노트 사진 찍기’를 눌러 단어를 모으는 화면을 보자.', '오늘의 노트 사진 찍기를 열어 어휘 수집 화면을 확인합니다. 3·4단계에서 같은 단어 은행을 사용합니다.');
        explore('photo-view', 'photo', ['#word-bank-camera-modal .word-bank-camera-body'], '실제로는 촬영 버튼이나 사진 파일 선택으로 노트를 넣어. 이번에는 사진 없이 이 화면의 위치부터 살펴보자.', '촬영 또는 사진 파일 선택으로 노트를 넣는 화면입니다. 글자가 또렷한 자료를 사용하고 추출 결과를 확인합니다. 안내에서는 카메라와 업로드를 실행하지 않습니다.');
        enter('bank', '단어 은행', 'openDictationBankModal()', 'bank', '‘단어 은행’을 눌러 모아 둔 낱말을 보자.', '단어 은행을 열어 수집된 어휘와 학습 통계를 확인해 보세요.');
        explore('bank-view', 'bank', ['.dictation-bank-modal-shell'], '모은 낱말과 학습한 결과를 여기서 볼 수 있어. 아직 비어 있으면 실제 노트 사진을 넣은 뒤 확인하자.', '단어별 정답률·오답률을 확인하는 화면입니다. 단어가 없다면 실제 노트 사진에서 어휘를 모은 뒤 표시됩니다.');
        if (level === 3) {
            enter('mission', '교과 맞춤쓰기', '#dictation-mission-card', 'mission-photo', '큰 ‘교과 맞춤쓰기’ 버튼을 눌러 보자. 노트 사진으로 이번에 공부할 단어를 정하는 곳부터 시작해.', '교과 맞춤쓰기는 노트 사진으로 이번 학습의 어휘를 정하는 흐름입니다. 큰 버튼을 눌러 시작 화면을 확인해 주세요.');
            explore('mission-photo-view', 'mission-photo', ['#word-bank-camera-modal .word-bank-camera-body'], '사진에서 단어를 확인한 뒤 쓰기 공부로 이어져. 다음 화면은 사용 방법을 알아보려고 ‘나무’ 한 단어를 넣은 체험이야.', '사진 확인 후 실제 쓰기 화면으로 이어집니다. 촬영 자료가 없어도 탐색할 수 있도록 다음 화면은 ‘나무’ 한 단어를 넣은 체험으로 엽니다.');
            explore('trace', 'trace', ['#curricular-writing-canvas-0'], '이게 실제 ‘단어 따라쓰기’ 판이야. 회색 글자 위를 조금 써 보자.', '실제 단어 따라쓰기 화면입니다. 회색 글자를 따라 쓰면서 낱말의 형태와 쓰는 움직임을 연결해 주세요.', ['#curricular-writing-canvas-0'], 'stroke');
            press('trace-check', 'trace', '#curricular-confirm-btn-0', '확인', '‘확인’을 눌러 얼마나 따라 썼는지 보자. 부족하면 더 채우면 돼.', '확인을 눌러 실제 채움 정도 피드백을 확인해 보세요. 충분하지 않으면 회색 글자를 더 따라 쓰게 안내합니다.');
            explore('trace-feedback', 'trace', ['#curricular-trace-status-0'], '이 숫자는 회색 글자를 얼마나 채웠는지 알려 줘. 이제 받아쓰기 화면도 볼까?', '채움 정도가 이곳에 표시됩니다. 다음으로 실제 받아쓰기 화면의 사용법을 살펴보겠습니다.');
            explore('dictate-look', 'dictate', ['#dictation-prompt-button'], '여기는 듣고 쓰는 받아쓰기야. 따라쓰기와 달리 빈칸에 써야 해. 지금은 ‘나무’ 한 단어로 체험할 거야.', '실제 1단 단어 받아쓰기 화면을 체험합니다. 본 학습은 단증에 따라 단어·문장 힌트·문장 전체 받아쓰기로 달라집니다.');
            press('dictate-listen', 'dictate', '#dictation-prompt-button', '듣기', '듣기 버튼을 눌러 낱말을 들어 보자.', '듣기 버튼을 눌러 문제 음성을 확인해 주세요. 필요하면 반복해서 들을 수 있습니다.');
            explore('dictate-write', 'dictate', ['#curricular-writing-canvas-0'], '들은 ‘나무’를 실제 빈칸에 써 보자. 안내에서는 AI 채점과 저장은 하지 않아.', '실제 받아쓰기판에 직접 써 보세요. 이 체험에서는 AI 채점과 기록 저장을 실행하지 않습니다.', ['#curricular-writing-canvas-0'], 'stroke');
            explore('dictate-check', 'dictate', ['#curricular-confirm-btn-0'], '실제 공부에서는 다 쓴 뒤 ‘확인’을 눌러 AI 채점을 받아. 틀리면 보여 주는 정답을 읽고 다시 써 보자.', '문항별 확인 버튼이 AI 손글씨 채점을 실행합니다. 오답은 제시되는 정답을 확인한 뒤 재시도하도록 안내해 주세요.');
            enter('practice', '교과 맞춤쓰기 연습하기', 'openDictationPracticeActivity()', 'review', '‘교과 맞춤쓰기 연습하기’를 눌러 보자. 이전에 틀린 단어와 문장을 다시 연습하는 버튼이야.', '연습하기를 열어 실제 오답 복습 화면을 확인합니다. 오답이 없으면 아직 연습할 내용이 없다는 안내가 표시됩니다.');
            explore('practice-view', 'review', [], '오답이 있으면 따라쓰기와 받아쓰기로 이어져. 없다면 잘못된 게 아니야. 실제 미션 기록이 생긴 뒤 사용할 수 있어.', '저장된 오답이 있으면 2스텝 따라쓰기와 3스텝 받아쓰기를 진행합니다. 오답이 없는 계정은 빈 상태 안내를 확인해 주세요.');
            enter('record', '나의 기록', 'openMyDictationFromDashboard()', 'dictation-record', '‘나의 기록’을 열어 보자. 오답과 완료한 내용을 모아 보는 곳이야.', '나의 기록에서 오답·완료 목록과 단어별 학습 통계를 확인해 주세요.');
            explore('record-view', 'dictation-record', ['#dictation-wrong-bank-list'], '이전에 어떤 내용을 공부했는지 확인하고 다시 연습할 수 있어. 이번 체험 글씨는 이 기록에 들어가지 않아.', '이전 수행을 확인하고 오답 연습으로 연결할 수 있습니다. 이번 안내의 예시 글씨는 개인 기록에 포함되지 않습니다.');
        } else {
            enter('mission', '문해력 문제', '#literacy-mission-card', 'literacy', '‘문해력 문제’를 눌러 보자. 실제 문제 화면을 예시 지문 한 개로 체험할 거야.', '문해력 문제의 실제 풀이 화면을 엽니다. 안내 중에는 예시 문제를 사용하며 본 학습은 학생의 문해력 단증에 맞춰 생성됩니다.');
            explore('passage', 'literacy', ['#literacy-passage-content'], '먼저 읽기 지문을 읽어 보자. 민수가 무엇을 했는지 생각해 봐. 다음으로 문제와 보기를 볼 거야.', '왼쪽 실제 지문 상자를 먼저 확인합니다. 예시 글에서 인물의 행동을 읽은 뒤 질문으로 이동해 주세요.');
            explore('answer', 'literacy', ['#literacy-passage-content', '#literacy-question-content', '#literacy-options-container'], '질문을 읽고 보기 중 답을 눌러 봐. 모르겠으면 왼쪽 지문을 다시 읽어도 돼.', '실제 보기를 눌러 답을 선택해 보세요. 정답을 재촉하기보다 어느 문장을 보고 선택했는지 물어봐 주세요.', ['#literacy-options-container button']);
            explore('feedback', 'literacy', ['#literacy-feedback-container'], '정답과 해설이 여기에 나와. 내 답과 비교하고 지문에서 근거를 다시 찾아보자. 체험 결과는 기록에 남지 않아.', '실제 결과 영역에서 정답과 해설을 확인합니다. 정오답 모두 근거를 다시 읽게 해 주세요. 예시 답변은 개인 기록·공용 오답 은행에 저장하지 않습니다.');
            enter('limit', '도전! 한계 돌파', '#literacy-limit-break-card', 'limit', '‘도전! 한계 돌파’를 눌러 보자. 여러 사용자의 오답이 모인 은행에서 문제를 고르는 곳이야.', '한계 돌파를 열어 공용 오답 은행의 난이도 선택 화면을 확인합니다. 개인 오답만 모인 곳과는 다릅니다.');
            press('difficulty', 'limit', '#modal-message [onclick="window.changeLimitBreakDifficulty(\'normal\')"]', 'NORMAL', 'NORMAL 버튼을 눌러 보자. 난이도를 바꾸면 도전할 문제 수가 달라져.', 'NORMAL을 눌러 난이도별 공용 문제 개수를 확인해 주세요.');
            explore('limit-view', 'limit', ['#modal-message'], '문제가 있으면 아래 시작 버튼으로 도전할 수 있어. 0개라면 그 난이도에 모인 문제가 아직 없는 거야.', '현재 문제 수와 시작 버튼을 확인합니다. 문제가 없는 난이도는 시작할 수 없으므로 다른 난이도나 본 미션을 사용합니다.');
            enter('record', '나의 기록', 'openMyLiteracyRecord()', 'literacy-record', '‘나의 기록’을 눌러 이전 문제의 결과를 보자.', '나의 기록을 열어 정답·오답과 풀이 이력을 확인해 주세요.');
            explore('record-view', 'literacy-record', ['#modal-message'], '풀었던 문제를 여기서 다시 확인해. 아직 기록이 없으면 실제 문제를 푼 뒤 볼 수 있어.', '결과와 실제 풀이 과정을 함께 해석해 주세요. 기록이 없는 학생은 첫 문제 풀이 후 확인할 수 있습니다.');
        }
        enter('repository', '단어 카드 저장소', `openSharedWordCardRepository('${info.route}')`, 'repository', '‘단어 카드 저장소’를 열어 보자. 낱말의 뜻과 그림이 담긴 카드를 모아 보는 곳이야.', '단어 카드 저장소를 열어 공유된 단어·설명·그림 카드를 확인해 보세요.');
        explore('repository-view', 'repository', ['#shared-word-card-content'], '카드가 보이면 하나를 눌러 안쪽을 살펴봐도 좋아. 카드가 없으면 아직 만들어진 공용 카드가 없는 거야.', '게시된 카드가 있으면 눌러 상세 내용을 탐색할 수 있습니다. 아직 카드가 없다면 빈 목록을 확인한 뒤 계속 진행하세요.');
        enter('library', '에이두 도서관', `#stage-${level}-library`, 'library', '위쪽 ‘에이두 도서관’을 눌러 동화책 목록을 열어 보자.', '에이두 도서관을 열어 읽기 자료를 살펴보세요.');
        explore('library-view', 'library', ['#aiedue-library-content'], '책이 보이면 표지를 눌러 읽고 페이지를 넘겨 봐도 좋아. 아직 책이 없으면 나중에 다시 와 보자.', '책이 있으면 표지를 눌러 페이지를 탐색할 수 있습니다. 학생에게 그림과 글을 연결해 이야기를 말하게 해 주세요. 선생님은 상단의 동화책 만들기로 자료를 준비할 수도 있습니다.');
        enter('game', level === 3 ? '단어 카드 한 판' : '문해력 탐정단', level === 3 ? '#stage-3-game-word-card' : '#stage-4-game-literacy', level === 3 ? 'word-game' : 'detective',
            level === 3 ? '‘단어 카드 한 판’을 눌러 카드 게임 준비 화면을 보자.' : '‘문해력 탐정단’을 눌러 사건을 푸는 게임 화면을 보자.',
            level === 3 ? '단어 카드 한 판을 열어 어휘 카드로 하는 게임의 준비 화면을 확인합니다.' : '문해력 탐정단을 열어 사건 지문과 추리 답변 화면을 확인합니다.');
        explore('game-view', level === 3 ? 'word-game' : 'detective', [level === 3 ? '#word-card-table-game-section' : '#literacy-adventure-loading'],
            level === 3 ? '저장소의 그림과 설명을 보고, 내 카드 네 장 중 같은 단어를 고르는 게임이야. 정답은 1점이고 시간 제한은 없어.' : '사건 지문에서 시간·장소·행동의 단서를 연결해 답을 쓰는 게임이야. 준비되면 실제 활동에서 첫 사건을 시작해 봐.',
            level === 3 ? '공용 저장소 카드의 그림·설명을 보고 네 장 중 같은 단어를 고릅니다. 시간 제한 없이 어휘의 의미를 떠올리는 활동으로 활용해 주세요.' : '사건의 여러 단서를 연결해 추리하는 활동입니다. 기본 문해력 문제와 구분해, 근거를 연결하는 연습에 활용해 주세요.');
    }
    add('finish', 'hub', [], '버튼들을 직접 둘러봤어! 이제 하고 싶은 활동 하나를 골라 시작하자. 다시 보고 싶으면 홈의 ‘처음해봐요’를 눌러 줘.', '실제 화면 탐색을 마쳤습니다. 학생에게 필요한 활동 하나를 골라 시작해 주세요. 홈의 처음해봐요에서 다시 볼 수 있습니다.');
    for (const step of steps) {
        if (step.id.endsWith('-repository-view')) step.allow = ['#shared-word-card-content .shared-word-card-tile', '#shared-word-card-content .shared-word-card-back', '#shared-word-card-content .shared-word-card-sentence', '#shared-word-card-content .shared-word-card-tts'];
        if (step.id.endsWith('-library-view')) step.allow = ['#aiedue-library-content .aiedue-book-card', '#aiedue-library-content .aiedue-book-nav button', '#aiedue-library-content [onclick="refreshAiedueLibrary()"]'];
    }
    return steps;
}

export const STAGE_TUTORIAL_QUESTION = Object.freeze({
    tutorial: true, difficulty: 'easy', type: 'multipleChoice',
    passage: '민수는 화분의 흙을 만져 보았어요. 흙이 말라 있었어요. 민수는 물뿌리개에 물을 담아 화분에 주었어요.',
    question: '민수는 흙이 말라 있는 것을 보고 무엇을 했나요?',
    options: ['화분을 버렸어요.', '화분에 물을 주었어요.', '꽃을 꺾었어요.', '창문을 닫았어요.'],
    answerIndex: 1, explanation: '마지막 문장의 “물뿌리개에 물을 담아 화분에 주었어요”에서 답을 확인할 수 있어요.'
});
