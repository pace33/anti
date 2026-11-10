import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const gradeCode=extract('function literacyPassingAccuracy(', '\nasync function pickLiteracyDetectiveLimitBreakQuestion(');
const shortCode=extract('window.submitLiteracyShortAnswer = ', '\nwindow.submitLiteracyEssayAnswer = ');
const question={type:'shortAnswer',passage:'민수는 우산을 챙겼다.',question:'무엇을 챙겼나요?',answer:'우산',acceptableAnswers:['우산이요'],difficulty:'easy'};
function harness(result={score:100,feedback:'핵심 내용을 잘 이해했어요.'}){
 const requests=[],saved=[],errors=[];const context={window:{},activeLiteracyQuestion:question,currentUserId:'test-student',userLiteracyAnswerChecked:false,normalizeLiteracyKeywords:()=>['우산'],callKoreanAiGenerate:async(prompt,options)=>{requests.push({prompt,options});return JSON.stringify(result);},document:{getElementById:()=>({value:'우산이 아니라 모자'})},showLiteracyResult:async(correct,details)=>saved.push({correct,...details}),showModal:m=>errors.push(m),showActivityLoading:()=>{},hideActivityLoading:()=>{},aiErrorMessage:()=> 'AI 생성에 실패했습니다. 오류 코드: AI-1001',console:{error:()=>{}},createAiError:()=>Object.assign(new Error('invalid AI result'),{code:'AI-1001'})};
 vm.createContext(context);vm.runInContext(gradeCode+'\n'+shortCode,context);return {context,requests,saved,errors};
}
test('short and essay use the dedicated D1 profile and structured evidence',async()=>{
 const h=harness();for(const type of ['shortAnswer','essay']){await h.context.gradeLiteracyEssayQuestion({...question,type,sampleAnswer:'우산을 챙겼다.'},'우산이요',{detective:true});const req=h.requests.at(-1);assert.equal(req.options.profile,'korean-literacy-grade');const data=JSON.parse(req.prompt);assert.equal(data.type,type);assert.equal(data.detective,true);assert.equal(data.studentAnswer,'우산이요');assert.equal(data.answer,type==='shortAnswer'?'우산':'우산을 챙겼다.');}
});
test('short answers pass at 90% and essays at 80%, including exact boundaries',async()=>{
 for(const [type,score,expected] of [['shortAnswer',89.99,false],['shortAnswer',90,true],['shortAnswer',80,false],['essay',79.99,false],['essay',80,true],['essay',90,true]]){
  const h=harness({score,feedback:'채점 완료'});
  for(const detective of [false,true])assert.equal((await h.context.gradeLiteracyEssayQuestion({...question,type},'답안',{detective})).isCorrect,expected,`${type} ${score} detective=${detective}`);
 }
});
test('essay examples prefer sampleAnswer and fall back to answer; short uses answer',()=>{
 const h=harness();assert.equal(h.context.literacyExampleAnswer({...question,sampleAnswer:'예시 문장'}),'우산');
 assert.equal(h.context.literacyExampleAnswer({...question,type:'essay',sampleAnswer:'예시 문장'}),'예시 문장');
 assert.equal(h.context.literacyExampleAnswer({...question,type:'essay'}),'우산');
});
test('ordinary and detective results display accuracy, thresholds and examples even when correct',()=>{
 const result=extract('async function showLiteracyResult(', '\nwindow.claimLiteracyWrongReviewReward');
 assert.match(result,/정확도 \$\{renderedDetails.score\}%/);assert.match(result,/if \(hasScore\)[\s\S]*예시 정답:/);
 const game=fs.readFileSync(new URL('../literacy-adventure-game.js',import.meta.url),'utf8');
 assert.match(game,/state.round\?\.type === 'shortAnswer' \? 90 : 80/);assert.match(game,/example.textContent = `예시 정답:/);
});
test('ordinary short answers await semantic grading, then save the score and feedback once',async()=>{
 const h=harness({score:0,feedback:'다시 살펴보세요.'});await h.context.window.submitLiteracyShortAnswer();assert.equal(h.requests.length,1);assert.equal(h.saved.length,1);assert.equal(h.saved[0].correct,false);assert.equal(h.saved[0].score,0);assert.equal(h.saved[0].feedback,'다시 살펴보세요.');assert.equal(h.saved[0].userAnswerText,'우산이 아니라 모자');
});
test('invalid output cannot save a fabricated zero grade; retry is available',async()=>{
 for(const result of [{score:NaN,feedback:'오류'},{score:101,feedback:'오류'},{score:'100',feedback:'문자열'},{score:100,feedback:''}]){const h=harness(result);await h.context.window.submitLiteracyShortAnswer();assert.equal(h.saved.length,0);assert.equal(h.context.userLiteracyAnswerChecked,false);assert.equal(h.errors.length,1);}
});
test('switching question or account during inference cannot save the old result',async()=>{
 const h=harness();h.context.callKoreanAiGenerate=async()=>{h.context.activeLiteracyQuestion={...question};h.context.currentUserId='other-student';return JSON.stringify({score:100,feedback:'좋아요.'});};await h.context.window.submitLiteracyShortAnswer();assert.equal(h.saved.length,0);
});
test('detective short answers share the same semantic grade and persist their feedback',()=>{
 const block=extract("        } else if (question.type === 'shortAnswer') {",'        const attempt = { ...createLiteracyAttemptPayload');assert.match(block,/gradeLiteracyEssayQuestion\(question, value, \{ detective: true \}\)/);assert.doesNotMatch(block,/includes\(normalized\)|normalized\.includes/);assert.match(block,/feedback: detail/);
});
