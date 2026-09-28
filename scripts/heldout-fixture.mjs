// Freeze before the first live request. These cases were not used to tune v2.
import { gradeChallenge } from './recall-challenges.mjs';
export const heldoutVersion = 'heldout-recall-v1';
export const heldoutSettings = { context: 8192, recent: 12, budget: 800 };
const message = (mes, index, user = index % 2 === 0) => ({ mes, name: user ? 'User' : 'Archivist', is_user: user, is_system: false, send_date: 0, extra: {} });
const scenes = {
    en: [
        ['Elena’s cracked porcelain bird', 'Jonas’s folded river map', 'BIRCH-284', 'FLINT-936'],
        ['Tessa’s green theatre mask', 'Owen’s brass music box', 'REED-517', 'SLATE-862'],
        ['Iris’s embroidered travel pouch', 'Felix’s glass telescope lens', 'FERN-493', 'COVE-728'],
    ],
    ko: [
        ['유나의 금이 간 도자기 새', '도윤의 접어 둔 강 지도', 'PLUM-326', 'MOSS-815'],
        ['하린의 초록색 연극 가면', '지후의 황동 오르골', 'PINE-649', 'ASH-273'],
        ['서연의 수놓은 여행 주머니', '민준의 유리 망원경 렌즈', 'LIME-958', 'OAK-461'],
    ],
};
const beats = {
    en: ['We waited for the rain to stop before opening the shutters.', 'The caretaker brought tea and asked whether the roof repairs were finished.', 'I checked the rehearsal schedule while you swept the entrance steps.', 'A delivery cart rattled past the window, and the cat hid beneath a chair.', 'We agreed to mend the torn curtain after lunch, once the room was empty.', 'The courtyard grew quiet as the visitors left for the evening train.', 'I drew the outline of the garden; you suggested planting herbs by the wall.', 'We counted the clean cups and washed the paint from the work table.'],
    ko: ['비가 그치기를 기다렸다가 덧문을 열기로 했다.', '관리인이 차를 가져와 지붕 수리가 끝났는지 물었다.', '나는 연습 일정을 확인했고 너는 입구 계단을 쓸었다.', '배달 수레가 창문을 지나가자 고양이가 의자 아래로 숨었다.', '방이 비는 점심시간에 찢어진 커튼을 꿰매기로 했다.', '방문객들이 저녁 기차를 타러 떠나자 안뜰이 조용해졌다.', '내가 정원 윤곽을 그리자 너는 담 옆에 허브를 심자고 했다.', '깨끗한 찻잔을 세고 작업대에 묻은 물감을 닦았다.'],
};
export function heldoutCases() {
    return ['en', 'ko'].flatMap(language => ['reference', 'continue', 'overflow'].flatMap((kind, scene) => [0, 1].map(target => {
        const ko = language === 'ko', [a, b, x, y] = scenes[language][scene];
        const subjects = [a, b], labels = [x, y], subject = subjects[target];
        const size = kind === 'overflow' ? 180 : 64;
        const source = Array.from({ length: size }, (_, i) => message(`${ko ? '장면' : 'Scene'} ${i}. ` + Array.from({ length: kind === 'overflow' ? 10 : 1 }, (_, j) => beats[language][(i + j) % 8]).join(' '), i));
        const facts = subjects.map((s, i) => ko ? `${s}의 보관함 코드는 ${labels[i]}이다. 물건을 돌려줄 때 이 기록을 확인하자.` : `The storage code for ${s} is ${labels[i]}. Check this record when returning the object.`);
        source[4] = message(facts[0], 4); source[9] = message(facts[1], 9);
        for (let i = 12; i < 32; i++) source[i] = message(ko ? `다른 손님 ${i}의 소품 보관함 코드는 CRATE-${100 + i}이다. 두 주인공의 물건과 혼동하지 말자.` : `The prop for guest ${i} uses storage code CRATE-${100 + i}. Keep it separate from the two protagonists’ belongings.`, i);
        const instruction = ko ? '보관함 코드만 답하세요. 기록이 없으면 UNKNOWN이라고 답하세요.' : 'Reply with only the storage code, or UNKNOWN if there is no record.';
        let question;
        if (kind === 'reference') {
            source[size - 4] = message(ko ? `이제 ${subject} 이야기로 돌아가자.` : `Let us return to ${subject}.`, size - 4, true);
            source[size - 3] = message(ko ? '맞아, 주인이 그것을 찾으러 올 시간이네.' : 'Right, its owner will be coming back for it soon.', size - 3, false);
            source[size - 2] = message(ko ? '그럼 다른 물건들은 잠시 두자.' : 'Then let us set the other belongings aside for now.', size - 2, true);
            source[size - 1] = message(ko ? '좋아. 아까 말한 그 물건의 보관 기록을 확인해 볼게.' : 'All right. I will check the storage record for the item we just mentioned.', size - 1, false);
            question = `${ko ? '그건 어느 보관함에 두었지?' : 'Which storage code was assigned to it?'} ${instruction}`;
        } else if (kind === 'continue') {
            source[size - 4] = message(ko ? `${subjects[1-target]} 이야기는 여기서 마치자.` : `Let us finish discussing ${subjects[1-target]}.`, size - 4, true);
            source[size - 3] = message(ko ? '그 주인은 떠났고 다음 손님이 문을 두드렸다.' : 'That owner departed, and the next visitor knocked at the door.', size - 3, false);
            source[size - 2] = message(ko ? `새 손님은 ${subject}을 돌려받으러 왔다. 나는 예전 보관 기록을 펼쳤다.` : `The new visitor came to collect ${subject}. I opened our earlier storage record.`, size - 2, false);
            source[size - 1] = message(ko ? `${subject}의 보관함 코드를 확인했다. ${instruction} 코드는 ` : `I checked the storage code for ${subject}. ${instruction} The code is `, size - 1, false);
        } else question = `${ko ? `${subject}의 보관함 코드는?` : `What is the storage code for ${subject}?`} ${instruction}`;
        return { id: `${language}-${kind}-${target}`, language, kind, type: kind === 'continue' ? 'continue' : 'normal', source, question, label: labels[target], otherLabel: labels[1-target], fact: facts[target] };
    })));
}
// This is bounded code evidence, not a semantic truth grader: explanations/negation
// can contain a correct code. Preserve exact answers for human inspection.
export function answerEvidence(answer, label) {
    const codes = [...new Set(String(answer).normalize('NFKC').toUpperCase().match(/\b[A-Z]+-\d+\b/g) || [])];
    return { strictCorrect: gradeChallenge(answer, label), expectedCodeOnly: codes.length === 1 && codes[0] === label, codes };
}
