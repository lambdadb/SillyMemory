import { assistantTopicCases } from './assistant-topic-diagnostic.mjs';
import { contextEdgeCases } from './context-edges.mjs';
import { loadNaturalFixture } from './natural-dialogue.mjs';

export function assistantFallbackCases() {
    const stories = loadNaturalFixture('long-dialogue-v1').stories;
    const controls = contextEdgeCases().filter(c => c.kind === 'first-user').flatMap(source => {
        return ['explicit-switch', 'correction', 'blank-assistant', 'retained-answer', 'blank-user'].map(kind => {
            const snapshot = structuredClone(source.snapshot), english = source.language === 'en';
            snapshot.chat = `fallback-controls/${source.language}-${kind}`;
            const messages = snapshot.messages, question = messages.at(-1), cue = messages.at(-2);
            let message = 8;
            if (kind === 'explicit-switch') {
                cue.text = english ? 'Let us discuss the rolled canal map again.' : '접이식 노선도 이야기를 다시 해요.';
                question.text = english ? 'Who is bringing the green cloth banner, and when?' : '자주색 천 현수막은 누가 언제 가져오기로 했죠?';
            }
            if (kind === 'correction') {
                cue.text = english ? 'Ask what you need to confirm from our preparations.' : '준비한 내용에서 확인할 것을 물어보세요.';
                question.text = english ? 'What is the final Sunday departure time from the archive landing?' : '일요일 해설 산책은 최종적으로 몇 시에 시작하나요?';
                message = 20;
            }
            if (kind === 'blank-assistant' || kind === 'blank-user') messages.splice(-1, 0, { ...cue, user: kind === 'blank-user', name: kind === 'blank-user' ? 'User' : cue.name, text: '   ' });
            if (kind === 'retained-answer') messages.push({ ...cue, text: english ? 'Let us talk about the canal map instead.' : '대신 접이식 노선도에 대해 이야기해요.' });
            messages.forEach((m, index) => m.index = index);
            const story = stories.find(s => s.language === source.language);
            return { id: snapshot.chat, fixture: 'assistant-fallback-controls-v1', language: source.language, kind,
                snapshot, config: { recent: 12, budget: 400, chunkChars: 800 }, evidence: [{ message, quote: story.messages[message].text }] };
        });
    });
    return [...assistantTopicCases(), ...controls];
}
