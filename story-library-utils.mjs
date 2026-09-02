const clean = (value, max = 2000) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

function extractJson(text) {
  const source = clean(text, 30000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('동화 JSON을 찾지 못했습니다.');
  return JSON.parse(source.slice(start, end + 1));
}

export function validateStoryCharacter(character) {
  const normalized = {
    name: clean(character?.name, 40),
    appearance: clean(character?.appearance, 500),
    personality: clean(character?.personality, 500)
  };
  if (!normalized.name) throw new Error('등장인물 이름을 입력해 주세요.');
  if (!normalized.appearance) throw new Error('등장인물 외형을 입력해 주세요.');
  if (!normalized.personality) throw new Error('등장인물 성격을 입력해 주세요.');
  return normalized;
}

export function buildStoryGenerationPrompt({ idea, characters = [], spreadCount = 4 }) {
  const safeIdea = clean(idea, 3000);
  if (!safeIdea) throw new Error('동화의 주제와 이야기를 입력해 주세요.');
  const safeCharacters = characters.map(validateStoryCharacter);
  if (!safeCharacters.length) throw new Error('등장인물 사전에서 인물을 한 명 이상 선택해 주세요.');
  const characterText = safeCharacters.map((character, index) => `${index + 1}. 이름: ${character.name}\n   외형: ${character.appearance}\n   성격: ${character.personality}`).join('\n');
  return `자연스럽고 몰입감 있는 한국어 동화를 만드세요.
교사가 적은 이야기 구상: ${safeIdea}

반드시 사용할 등장인물:
${characterText}

규칙:
- 왼쪽 글 페이지와 오른쪽 그림 페이지가 한 묶음인 펼침면을 정확히 ${spreadCount}개 만듭니다.
- 각 text는 한 펼침면에 어울리는 2~4문장으로 씁니다.
- 시작, 사건, 해결, 인상적인 마무리가 자연스럽게 이어져야 합니다.
- 등장인물의 외형과 성격을 모든 장면에서 일관되게 유지합니다.
- imagePrompt에는 해당 장면의 배경, 행동, 표정, 구도와 등장인물의 외형을 구체적으로 씁니다.
- 그림 안에는 글자, 자막, 말풍선, 로고를 넣지 않도록 imagePrompt에 명시합니다.

반드시 아래 모양의 JSON만 출력하세요.
{"title":"책 제목","summary":"한 문장 소개","spreads":[{"text":"왼쪽 페이지 본문","imagePrompt":"오른쪽 페이지 그림 설명"}]}`;
}

export function normalizeStoryPlan(rawText, spreadCount = 4) {
  const parsed = typeof rawText === 'string' ? extractJson(rawText) : rawText;
  const title = clean(parsed?.title, 80);
  const summary = clean(parsed?.summary, 240);
  const rawSpreads = Array.isArray(parsed?.spreads) ? parsed.spreads : [];
  if (!title) throw new Error('AI가 책 제목을 만들지 못했습니다.');
  if (rawSpreads.length !== spreadCount) throw new Error(`동화 펼침면은 정확히 ${spreadCount}개여야 합니다.`);
  const spreads = rawSpreads.map((spread, index) => {
    const text = clean(spread?.text, 1500);
    const imagePrompt = clean(spread?.imagePrompt, 1800);
    if (!text || !imagePrompt) throw new Error(`${index + 1}번째 펼침면의 글 또는 그림 설명이 비어 있습니다.`);
    return { text, imagePrompt };
  });
  return { title, summary: summary || `${title} 이야기`, spreads };
}

export function buildStoryImagePrompt({ title, spread, spreadIndex, spreadCount, characters = [], style = '따뜻하고 포근한 수채화 동화책' }) {
  const characterText = characters.map(validateStoryCharacter).map(character => `${character.name}: ${character.appearance}; 성격은 ${character.personality}`).join(' / ');
  return `${clean(style, 300)} 삽화. 『${clean(title, 80)}』의 ${Number(spreadIndex) + 1}/${Number(spreadCount)}번째 펼침면에서 오른쪽 페이지 전체에 들어갈 그림입니다.
장면: ${clean(spread?.imagePrompt, 1800)}
등장인물 설정: ${characterText}
등장인물은 앞뒤 장면에서도 알아볼 수 있도록 같은 외형, 옷, 색상, 비율을 정확히 유지하세요. 선택한 화풍과 이야기 분위기를 일관되게 유지하고, 명확한 표정과 읽기 좋은 장면 구도, 인쇄 가능한 고품질 삽화로 만드세요. 그림 안에는 글자, 자막, 말풍선, 로고, 워터마크를 절대 넣지 마세요.`;
}

export function normalizeImageJobStatusUrl(url, expectedJobId) {
  const value = clean(url, 1000);
  const path = value.startsWith('/korean-ai/') ? value : (value.startsWith('/api/image-jobs/') ? `/korean-ai${value}` : '');
  const match = path.match(/^\/korean-ai\/api\/image-jobs\/([^/?#]+)$/);
  if (!match || (expectedJobId && decodeURIComponent(match[1]) !== String(expectedJobId))) throw new Error('허용되지 않은 이미지 작업 상태 주소입니다.');
  return path;
}

export function normalizeImageJobUrl(url, expectedJobId) {
  const value = clean(url, 1000);
  const path = value.startsWith('/korean-ai/') ? value : (value.startsWith('/api/image-jobs/') ? `/korean-ai${value}` : '');
  const match = path.match(/^\/korean-ai\/api\/image-jobs\/([^/?#]+)\/images\/(\d+)$/);
  if (!match || (expectedJobId && decodeURIComponent(match[1]) !== String(expectedJobId))) throw new Error('허용되지 않은 이미지 다운로드 주소입니다.');
  return path;
}
