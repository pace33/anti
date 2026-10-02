import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const low = 'Gemini 3.8 Flash (Low)';
const calls = [];
let output = '{"words":["학교","나무"]}';
const response = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ text: output, model: low }) }; };
const context = vm.createContext({ fetch: response, fetchStoryResource: response, getAiTextFromResponse: data => data.text, parseAiJsonObject: JSON.parse, cleanKoreanWord: value => value, isLikelyKoreanNounBankWord: () => true, dictationPortfolio: { koreanBank: { words: [] } }, validateWordCardText: value => value, console });
vm.runInContext(source.slice(source.indexOf('const AIEDUE_KOREAN_FAST_'), source.indexOf('const SHARED_WORD_CARD_COLLECTION')), context);
vm.runInContext(source.slice(source.indexOf('async function requestSharedWordExplanation('), source.indexOf('async function loadWordCardCharacterReference(')), context);
test('text and image requests explicitly default to Flash Low, not local Gemma', async () => {
  await context.callKoreanAiGenerate('설명');
  assert.equal(calls.at(-1).body.model, low);
  await context.callKoreanAiGenerate('그림', { imageBase64: 'aW1hZ2U=' });
  assert.equal(calls.at(-1).body.model, low);
});
test('today-note photo sends structured fast profile and converts words for existing OCR UI', async () => {
  const result = await context.analyzeDictationImageWithAi('data:image/png;base64,aW1hZ2U=');
  assert.equal(calls.at(-1).body.profile, 'korean-note-photo');
  assert.equal(calls.at(-1).body.model, low);
  assert.equal(result, '학교\n나무');
});
test('word extraction uses Low with a dedicated fixed schema', async () => {
  const result = await context.extractDictationWordsWithAi('학교 나무');
  assert.equal(calls.at(-1).body.profile, 'korean-word-extract');
  assert.equal(calls.at(-1).body.model, low);
  assert.equal(result.words.join(','), '학교,나무');
});
test('word explanation accepts the finished JSON explanation, not the JSON string', async () => {
  output = '{"explanation":"학교는 함께 배우는 곳이에요."}';
  const result = await context.requestSharedWordExplanation('학교');
  assert.equal(calls.at(-1).body.profile, 'korean-word-explanation');
  assert.equal(calls.at(-1).body.model, low);
  assert.equal(result.explanation, '학교는 함께 배우는 곳이에요.');
});
test('canvas and notebook grading use fast profiles; character-reference editing remains intact', () => {
  const canvas = source.slice(source.indexOf('async function gradeCurricularCanvasItemWithAi'), source.indexOf('window.confirmCurricularCanvasItem'));
  assert.ok(canvas.includes("profile: 'korean-handwriting-grade'"));
  assert.ok(!canvas.includes("model: 'aiedue-gemma-vision'"));
  assert.ok(canvas.includes('parsed.correct === true && decideCurricularAiCorrect'));
  const notebook = source.slice(source.indexOf('async function gradeDictationSessionWithAi'), source.indexOf('function applyCurricularWritingStats'));
  assert.ok(notebook.includes("profile: 'korean-dictation-grade'"));
  const cards = source.slice(source.indexOf('async function generateSharedWordCard('), source.indexOf('window.playSharedWordCardTts'));
  assert.ok(cards.includes('loadWordCardCharacterReference(signal)'));
  assert.ok(cards.includes('createSettingsImageEditSession(characterReference, signal)'));
  assert.ok(cards.includes('createSettingsImageEditTurn(editSession'));
});
