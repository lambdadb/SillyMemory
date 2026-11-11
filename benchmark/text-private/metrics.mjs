// Structural evidence metrics from exact LongMemEval source bindings.
// Annotated messages are turns with has_answer=true; answer sessions are
// answer_session_ids. Chunks map back by message index and UTF-16 [start, end).
// Evaluation-only: never feed these annotations into retrieval or generation.

export function evidence(row, prepared) {
    const annotated = [], answerSessions = new Set();
    let index = 0;
    row.haystack_sessions.forEach((session, s) => {
        if (row.answer_session_ids.includes(row.haystack_session_ids[s])) answerSessions.add(s + 1);
        for (const turn of session) { if (turn.has_answer) annotated.push(index); index++; }
    });
    const length = new Map();
    for (const doc of prepared.docs) length.set(doc.message, Math.max(length.get(doc.message) || 0, doc.end));
    const indexed = annotated.filter(m => m < prepared.boundary && length.has(m));
    return { annotated, indexed, recent: annotated.filter(m => m >= prepared.boundary), answerSessions, length,
        byId: new Map(prepared.docs.map(d => [d.id, d])) };
}

// ids: ranked returned (or delivered) chunk IDs.
export function coverage(ev, ids) {
    const spans = new Map();
    let firstEvidence = null, firstSession = null;
    ids.forEach((id, rank) => {
        const doc = ev.byId.get(id);
        if (!doc) throw new Error('Unbound chunk');
        if (firstSession === null && ev.answerSessions.has(doc.benchmarkSession)) firstSession = rank + 1;
        if (ev.indexed.includes(doc.message)) {
            if (firstEvidence === null) firstEvidence = rank + 1;
            const list = spans.get(doc.message) || [];
            list.push([doc.start, doc.end]); spans.set(doc.message, list);
        }
    });
    let partial = 0, complete = 0;
    for (const message of ev.indexed) {
        const list = (spans.get(message) || []).sort((a, b) => a[0] - b[0]);
        if (!list.length) continue;
        let covered = 0, gap = false;
        for (const [start, end] of list) { if (start > covered) gap = true; covered = Math.max(covered, end); }
        if (!gap && covered >= ev.length.get(message)) complete++; else partial++;
    }
    return { annotated: ev.indexed.length, partial, complete, missing: ev.indexed.length - partial - complete,
        allComplete: ev.indexed.length > 0 && complete === ev.indexed.length, firstEvidence, firstSession,
        sessionHit: firstSession !== null };
}

export function aggregate(results) {
    const sum = key => results.reduce((n, r) => n + r[key], 0);
    const withAnnotations = results.filter(r => r.annotated > 0);
    const annotated = sum('annotated');
    const median = values => {
        const sorted = values.filter(v => v !== null).sort((a, b) => a - b);
        return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
    };
    return {
        questions: results.length, annotatedMessages: annotated,
        anyMessageCoverage: annotated ? (sum('partial') + sum('complete')) / annotated : null,
        completeMessageCoverage: annotated ? sum('complete') / annotated : null,
        questionsWithAnnotations: withAnnotations.length,
        allAnnotatedComplete: withAnnotations.filter(r => r.allComplete).length,
        anyEvidenceQuestions: withAnnotations.filter(r => r.partial + r.complete > 0).length,
        answerSessionHitQuestions: results.filter(r => r.sessionHit).length,
        medianFirstEvidenceRank: median(withAnnotations.map(r => r.firstEvidence)),
    };
}
