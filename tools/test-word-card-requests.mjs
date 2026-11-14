import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildWordCardRepository,wordCardRequestStatus} from '../word-card-requests.mjs';
const card=(id,word)=>({id,word,status:'published',isPublic:true,generationVersion:1,explanation:'뜻이에요.',illustration:{path:`SharedWordCards/${id}/generations/testtoken1/illustration.png`},publishedGenerationToken:'testtoken1'});
const idA='wc1_'+'a'.repeat(64),idB='wc1_'+'b'.repeat(64);
test('내 신청이 맨 위에 따로 모이고 다른 신청자의 카드도 모두 보인다',()=>{
 const view=buildWordCardRepository({cards:[card(idA,'나비'),card(idB,'장미')],requests:[{cardId:idB,word:'장미'}]});assert.equal(view.mine[0].id,idB);assert.equal(view.others[0].id,idA);assert.equal(view.pending.length,0);
});
test('미열람 NEW는 계정별 게시본 기준이며 목록만 열어서는 사라지지 않는다',()=>{
 const data={cards:[card(idA,'나비')],seen:{}};assert.equal(buildWordCardRepository(data).others[0].isNew,true);
 assert.equal(buildWordCardRepository({...data,seen:{[idA]:'testtoken1'}}).others[0].isNew,false);
 assert.equal(buildWordCardRepository({...data,seen:{[idA]:'oldertoken'}}).others[0].isNew,true);assert.deepEqual(data.seen,{});
});
test('대기/제작/실패 신청은 완성 카드와 분리한다',()=>{
 const view=buildWordCardRepository({requests:[{cardId:idA,word:'나비',status:'queued'}]});assert.equal(view.pending.length,1);assert.equal(view.mine.length,0);
 assert.match(wordCardRequestStatus('queued'),/대기/);assert.match(wordCardRequestStatus('generating'),/만들고/);assert.match(wordCardRequestStatus('needs-review'),/확인/);
});
test('뜻 버튼은 즉시 생성하고 신청 완료 안내를 남기지 않는다',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const meaning=app.slice(app.indexOf('window.openCurricularWordMeaning ='),app.indexOf('window.openSharedWordCardDetail ='));
 assert.ok(meaning.includes('ensureSharedWordCard(word, signal, requestId)'));
 assert.ok(meaning.includes('renderSharedWordCardDetail(card, requestId, signal)'));
 assert.equal(meaning.includes("wordCardAccountApi('/word-card-requests'"),false);
 assert.equal(app.includes('단어카드 신청이 완료됐어요'),false);
});

test('즉시 생성한 카드도 작성자 계정의 내 카드로 분류하고 NEW를 보존한다',()=>{
 const result=buildWordCardRepository({cards:[{...card(idA,'나비'),createdBy:'student-a'},{...card(idB,'장미'),createdBy:'student-b'}],seen:{}},'student-a');
 assert.equal(result.mine[0].id,idA);assert.equal(result.mine[0].isNew,true);
 assert.equal(result.others[0].id,idB);
 assert.equal(buildWordCardRepository({cards:[{...card(idA,'나비'),createdBy:'student-a'}]},'student-b').mine.length,0);
});
test('열람 저장은 이미지 실제 로드 후에만, 계정 API에 bearer 인증을 보낸다',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const render=app.slice(app.indexOf('async function renderSharedWordCardDetail'),app.indexOf('async function waitForPublishedSharedWordCard'));
 assert.ok(render.indexOf('await image.decode()')<render.indexOf('/seen`'));
 const api=app.slice(app.indexOf('async function wordCardAccountApi'),app.indexOf('window.openCurricularWordMeaning ='));
 assert.ok(api.includes('await user.getIdToken()'));assert.ok(api.includes('Authorization: `Bearer ${token}`'));assert.ok(api.includes("'X-Korean-User-Token': token"));assert.ok(api.includes('auth.currentUser?.uid !== user.uid'));
});
