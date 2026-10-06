import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { aiErrorCode, aiErrorMessage, createAiError } from '../ai-error-utils.mjs';
import { imageJobErrorMessage } from '../story-library-utils.mjs';
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('public failures contain only a fixed message and approved code, including legacy provider failures', () => {
    for (const error of ['Antigravity CLI failed', new Error('Gemini 3.8 Flash (Low) failed'), {error:{message:'AntiAI / Ollama private exception'}}, {message:'<img src=x onerror=alert(1)>',code:'Gemma-42'}, null]) {
        assert.equal(aiErrorMessage(error), 'AI 생성에 실패했습니다. 오류 코드: AI-1099');
    }
});
test('status categories map consistently, and coded nested image jobs preserve their category', () => {
    for (const [status, code] of [[503,'AI-1001'],[504,'AI-1002'],[429,'AI-1003'],[401,'AI-1004'],[400,'AI-1005'],[410,'AI-1009']]) {
        assert.equal(aiErrorCode({error:'Antigravity CLI failed'}, status), code);
        assert.equal(imageJobErrorMessage({error:{message:'private model error',code}}), `AI 생성에 실패했습니다. 오류 코드: ${code}`);
    }
    assert.equal(aiErrorCode(new TypeError('Failed to fetch')), 'AI-1008');
    assert.equal(aiErrorCode(new Error('Invalid structured AI output')), 'AI-1006');
    assert.equal(aiErrorCode(new Error('unsupported tool budget exceeded')), 'AI-1007');
});
test('safe errors are idempotent and unknown server-provided codes cannot expose arbitrary strings', () => {
    const error = createAiError({errorCode:'AI-1001',stderr:'private model trace'},503);
    assert.equal(error.code,'AI-1001');
    assert.equal(aiErrorMessage(error), error.message);
    assert.equal(aiErrorMessage(error.message), error.message);
    assert.equal(aiErrorMessage({errorCode:'Antigravity-SECRET'}), 'AI 생성에 실패했습니다. 오류 코드: AI-1099');
});
test('the actual common generate function discards legacy provider details on HTTP failure', async () => {
    const source = app.slice(app.indexOf('async function callKoreanAiGenerate('),app.indexOf('\nasync function analyzeDictationImageWithAi'));
    const context = vm.createContext({createAiError,AIEDUE_KOREAN_FAST_VISION_MODEL:'test-model',AIEDUE_KOREAN_FAST_TEXT_MODEL:'test-model',fetch:async()=>({ok:false,status:503,json:async()=>({error:'Antigravity CLI failed / Gemini',stderr:'private',errorCode:'AI-1001'})})});
    vm.runInContext(source,context);
    await assert.rejects(context.callKoreanAiGenerate('test prompt'),error=>error.code==='AI-1001'&&error.message==='AI 생성에 실패했습니다. 오류 코드: AI-1001');
});
test('all AI failure views use the formatter instead of showing provider messages', () => {
    assert.match(app,/showModal\(aiErrorMessage\(e\)\)/);
    assert.match(app,/showSettingsImageError\(message\)[\s\S]*?errorBox.textContent = aiErrorMessage\(message\)/);
    assert.match(app,/sharedWordCardError\(message\)[\s\S]*?message = aiErrorMessage\(message\)/);
    assert.match(app,/page.imageError = aiErrorMessage\(error\)/);
    assert(!/showModal\(`(?:문제 생성에 실패|AI 채점에 실패|AI 그림을 만들지 못)[\s\S]*?error\??\.message/.test(app));
});
