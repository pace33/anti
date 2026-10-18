// Shared by simple questions, full questions and mock interview; all authored text is escaped.
export function answerMarkup(q,escape){
 const paragraphs=String(q.sample||'').split(/\n\s*\n/).filter(Boolean);
 return `<section class="answer-draft" aria-label="구술 답변"><h3>구술 답변</h3><div class="oral-answer">${paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div><div class="report-needs"><h3>제출본 근거·해석 범위</h3><p>${escape(q.reportNeeds||q.evidence||'')}</p></div></section>`;
}
