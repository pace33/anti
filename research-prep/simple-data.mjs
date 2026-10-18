export const groups=[
 {id:'purpose',title:'연구 목적·차별성',categories:['연구 설계','핵심·차별성']},
 {id:'lesson',title:'수업·학습 활동',categories:['수업 설계','교과 맞춤쓰기','어휘·문해력','동기·보상','재학습·기록']},
 {id:'support',title:'학생 특성·지원',categories:['특수교육·현장','특수교육·접근성']},
 {id:'evidence',title:'효과·검증',categories:['검증·학생 변화']},
 {id:'ai',title:'AI·기술',categories:['AI·기술·윤리','AI·신뢰성','기술·운영']},
 {id:'ethics',title:'개인정보·윤리',categories:['개인정보·윤리']},
 {id:'spread',title:'일반화·확산',categories:['일반화·확산','일반화·운영']},
 {id:'pressure',title:'발표·압박 질문',categories:['발표·압박']}
];
export const pastSources=[
 {id:'hjs',label:'hjsmat · 2025.11.2. 게시',url:'https://m.blog.naver.com/hjsmat/224062374115',note:'게시글에서 ‘작년 문항’으로 회고. 문항 원문 없이 기억나는 6개 주제를 공개했습니다.'},
 {id:'ay',label:'ay_did · 2026.1.31. 게시',url:'https://m.blog.naver.com/ay_did/224166755170',note:'이전 대회 공동연구 참가 회고. 공개된 질문 주제만 정리했습니다.'}
];
export const pastQuestions=[
 {theme:'선행연구',question:'기존 연구와 비교했을 때, 이 연구만의 차이는 무엇인가요?',focus:'에이두 한글의 기능 목록보다 기존 수업의 어려움과 달라진 교수·학습 방법을 설명하기.',source:'hjs',group:'purpose'},
 {theme:'연구 검증',question:'연구의 효과를 어떤 방법으로 검증했나요?',focus:'실제 연구 설계·측정 시점·평가 기준과 한계를 함께 제시하기.',source:'hjs',group:'evidence'},
 {theme:'학생 변화',question:'연구 전후 학생에게 어떤 변화가 나타났나요?',focus:'게임 점수나 사용 횟수와 실제 한글·문해력 변화를 구분하고 근거 자료로 설명하기.',source:'hjs',group:'evidence'},
 {theme:'개념적 렌즈',question:'보고서의 핵심 개념은 무엇이고 수업에 어떻게 적용했나요?',focus:'보고서에서 실제 사용한 개념을 자기 말로 정의하고 대표 차시와 연결하기.',source:'hjs',group:'purpose'},
 {theme:'검증 도구',question:'사용한 평가 도구가 학생의 변화를 적절히 측정하나요?',focus:'평가 문항·채점 기준·지원 조건을 제시하고 타당도·신뢰도·통계적 유의성을 구분하기.',source:'hjs',group:'evidence'},
 {theme:'공동연구',question:'공동연구자의 역할과 협업 과정은 어땠나요?',focus:'공동연구인 경우에만 실제 역할과 전체 연구에 대한 공동 이해를 설명하기. 개인 연구라면 해당 없음.',source:'hjs',group:'purpose'},
 {theme:'연구 방향',question:'왜 이 문제를 연구의 중심으로 정했나요?',focus:'학생 실태 → 연구 목적 → 에이두 한글 활용의 필요성을 연결하기.',source:'ay',group:'purpose'},
 {theme:'연구방법 설계',question:'이 연구방법을 선택한 이유는 무엇인가요?',focus:'표본·수업 환경·측정 목표에 맞는 선택 이유와 대안의 한계를 말하기.',source:'ay',group:'evidence'},
 {theme:'데이터 분석의 의미',question:'이 데이터의 변화는 교육적으로 무엇을 의미하나요?',focus:'수치의 증가만 말하지 말고 실제 수행·수업·생활에서 달라진 점과 해석 범위를 설명하기.',source:'ay',group:'evidence'},
 {theme:'현장 적용',question:'다른 교사가 이 연구를 수업에 적용하려면 무엇이 필요한가요?',focus:'대상 수준·대표 수업·준비 시간·비용·재사용 자료와 적용 조건을 구체화하기.',source:'ay',group:'spread'}
];
export const rubric={
 lesson:{title:'디지털 교수·학습',items:[
 {title:'연구 목적 및 방법',score:30,detail:'목적의 독창성 20 · 방법의 타당성 10',focus:'왜 이 학생들에게 필요한가? 기존 연구와 무엇이 다른가?',prepare:'학생 실태, 연구문제, 선행연구 비교, 방법 선정 이유'},
 {title:'연구 내용',score:15,detail:'활동의 체계성 15',focus:'목적·수업·분석이 연결되고 학생 참여가 드러나는가?',prepare:'대표 차시, 수업 흐름, 상호작용, 실행 중 수정 기록'},
 {title:'연구 결과',score:15,detail:'내용의 효과성 15',focus:'학생의 변화가 실제 자료로 확인되는가?',prepare:'측정 자료, 평가 기준, 학생 산출물, 관찰 기록, 한계'},
 {title:'일반화 가능성 및 시사성',score:40,detail:'일반화 가능성 20 · 시사성 20',focus:'다른 교사도 적용할 수 있고 현장에 무엇을 남기는가?',prepare:'재사용 자료, 최소 조건, 비용·시간, 적용 범위와 예외'}
 ],tie:'일반화·시사성 → 목적·방법 → 내용 → 결과'},
 software:{title:'교육용 SW·AI',items:[
 {title:'연구 목적',score:30,detail:'독창성 20 · 학습 내용 타당성 10',focus:'기존 도구와 무엇이 다르고 교육과정에 어떻게 연결되는가?',prepare:'기존 도구 비교, 학습 목표, 교육과정 연결 자료'},
 {title:'구현 기술',score:20,detail:'안정성 10 · 우수성 10',focus:'안정적으로 작동하며 학습과 평가를 돕는가?',prepare:'실행 화면, 오류 대응, 반응 속도, 학습 지원 UI'},
 {title:'수업 활용',score:20,detail:'연구 활동 체계성 10 · 교수·학습 진행 효율성 10',focus:'개발·수업·연구가 체계적이고 실제 수업에 맞는가?',prepare:'개발·적용 기록, 대표 차시, 교사 판단과 지원'},
 {title:'일반화 가능성 및 시사성',score:30,detail:'일반화 가능성 20 · 시사성 10',focus:'다른 학교에서도 사용하고 발전시킬 수 있는가?',prepare:'배포·사용 안내, 운영 조건, 비용, 유지보수와 적용 한계'}
 ],tie:'일반화·시사성 → 연구 목적 → 수업 활용 → 구현 기술'}
};
export const officialSource='https://www.gbe.kr/edupia/cf/fileDownload.do?fileKey=44d9a1e87281ac99d87f381db6a4ae80';
