// Fixed synthetic cases: do not tune these after observing provider results.
export const challengeVersion = 'recall-challenges-v1';
export const challengeSettings = { context: 8192, recent: 12, budget: 800 };
const message = (text, index, user = index % 2 === 0) => ({ mes: text, name: user ? 'User' : 'Mira', is_user: user, is_system: false, send_date: 0, extra: {} });
export function challengeCases() {
    return ['en', 'ko'].flatMap(language => ['reference', 'continue', 'overflow'].map(kind => {
        const ko = language === 'ko', size = kind === 'overflow' ? 180 : 72;
        const filler = ko ? '우리는 빈 종이를 정리하고 창문 수리와 오후 날씨를 이야기했다. 특별한 물건이나 보관 장소에 관한 새 정보는 없었다. ' : 'We sorted blank paper and discussed window repairs and the afternoon weather. No new information about personal objects or storage locations was recorded. ';
        const source = Array.from({ length: size }, (_, i) => message(`${ko ? '일상 기록' : 'Routine entry'} ${i}: ${filler.repeat(kind === 'overflow' ? 6 : 1)}`, i));
        const label = ko ? 'LOTUS-683' : 'CEDAR-741';
        const fact = ko ? `수아의 남색 나침반을 보관하는 사물함 표시는 ${label}이다.` : `The locker label for Mira's indigo compass is ${label}.`;
        source[4] = message(fact, 4);
        for (let i = 5; i < 45; i++) source[i] = message(ko ? `기록 ${i}: 다른 여행자 ${i}의 붉은 나침반 보관 사물함 표시는 BOX-${100 + i}이다.` : `Record ${i}: traveler ${i}'s scarlet compass is stored in locker BOX-${100 + i}.`, i);
        source[46] = message(ko ? '노아의 붉은 나침반 사물함 표시는 RUBY-592이다.' : "Noah's scarlet compass has locker label RUBY-592.", 46);
        const subject = ko ? '수아의 남색 나침반' : "Mira's indigo compass";
        const instruction = ko ? '사물함 표시만 답하세요. 정보가 없으면 UNKNOWN이라고 답하세요.' : 'Reply with the locker label only, or UNKNOWN if unavailable.';
        let question;
        if (kind === 'reference') {
            source[size - 4] = message(ko ? `이번에는 ${subject}을 다시 이야기하자.` : `Let us return to ${subject}.`, size - 4, true);
            source[size - 3] = message(ko ? '좋아, 다른 여행자의 물건은 잠시 제쳐 두자.' : "Agreed. Set the other travelers' belongings aside.", size - 3, false);
            source[size - 2] = message(ko ? '응, 바로 그 물건이야.' : 'Yes, that particular item.', size - 2, true);
            source[size - 1] = message(ko ? '그 물건의 보관 기록을 확인하자.' : 'Let us check its storage record.', size - 1, false);
            question = `${ko ? '그건 어느 사물함에 있었지?' : 'Which locker was it in?'} ${instruction}`;
        } else if (kind === 'continue') {
            source[size - 8] = message(ko ? `노아의 붉은 나침반에 관해 말해 줘. ${instruction}` : `Tell me about Noah's scarlet compass. ${instruction}`, size - 8, true);
            for (let i = size - 7; i < size; i++) source[i] = message(ko ? `설명 ${i}: 그 이야기를 마치고 다른 보관 기록으로 넘어가자.` : `Narration ${i}: that topic is finished; move on to another storage record.`, i, false);
            source[size - 1] = message(ko ? `이제 ${subject}으로 넘어가자. ${instruction} 사물함 표시는 ` : `Now turn to ${subject}. ${instruction} Its locker label is `, size - 1, false);
        } else {
            question = `${ko ? `${subject}의 사물함 표시는 무엇인가요?` : `What is the locker label for ${subject}?`} ${instruction}`;
        }
        return { id: `${language}-${kind}`, language, kind, type: kind === 'continue' ? 'continue' : 'normal', source, question, label, fact };
    }));
}
export function gradeChallenge(answer, label) {
    const normalize = value => String(value).normalize('NFKC').trim().replace(/^[`"'\s]+|[`"'.!\s]+$/g, '').toUpperCase();
    return normalize(answer) === label;
}
