import { loadNaturalFixture } from './natural-dialogue.mjs';

export function contextEdgeCases() {
    const fixture = loadNaturalFixture('long-dialogue-v1');
    return fixture.stories.flatMap(story => ['first-user', 'assistant-topic', 'explicit-switch'].map(kind => {
        const messages = story.messages.map((m, index) => ({ index, text: m.text, user: kind === 'first-user' ? false : m.role === 'user', name: kind === 'first-user' || m.role === 'assistant' ? story.character : 'User', eligible: true, swipe: 0 }));
        const english = story.language === 'en';
        const append = (text, user) => messages.push({ index: messages.length, text, user, name: user ? 'User' : story.character, eligible: true, swipe: 0 });
        if (kind === 'explicit-switch') {
            append(english ? 'Let us discuss the rolled canal map again.' : '접이식 노선도 이야기를 다시 해요.', true);
            append(english ? 'Yes, we can return to that map.' : '네, 그 노선도에 대해 이야기해요.', false);
        } else append(english ? 'Let us return to the green cloth banner for the reading room.' : '전시실에 걸 자주색 천 현수막 이야기를 다시 해요.', false);
        append(english ? (kind === 'explicit-switch' ? 'Who is bringing the green cloth banner, and when?' : 'Who is bringing it, and when?') : (kind === 'explicit-switch' ? '자주색 천 현수막은 누가 언제 가져오기로 했죠?' : '그건 누가 언제 가져오기로 했죠?'), true);
        return { id: `${story.language}-${kind}`, language: story.language, kind, snapshot: { character: `${story.id}.png`, chat: `${story.language}-${kind}`, memory: { story: `${story.language}-${kind}` }, messages }, target: { message: 8, text: story.messages[8].text } };
    }));
}
