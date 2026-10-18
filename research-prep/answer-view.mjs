// Shared by simple questions, full questions and mock interview; all authored text is escaped.
export function answerMarkup(q,escape){
 const paragraphs=String(q.sample||'').split(/\n\s*\n/).filter(Boolean);
 return `<section class="answer-draft" aria-label="답변 초안"><h3>답변 초안</h3><div class="oral-answer">${paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div><div class="report-needs"><h3>보고서로 보강할 내용</h3><p>${escape(q.reportNeeds||q.evidence||'')}</p></div></section>`;
}
