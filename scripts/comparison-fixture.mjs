// Freeze questions, expected facts, settings, and order before live evaluation.
export { grade } from './korean-fixture.mjs';
export const version = 'ko-three-modes-v1';
export const modes = ['off', 'sillymemory', 'vectors'];
export const repeats = 2;
export const nativeSettings = { source: 'vllm', vllm_model: 'text-embedding-3-small', use_alt_endpoint: true, protect: 12, query: 3, insert: 3, message_chunk_size: 400, score_threshold: 0.25, position: 0, depth: 2, template: 'Past events:\n{{text}}', summarize: false, enabled_files: false, enabled_world_info: false };
function dialogue(length, theme) {
    const places = ['작업실', '시장', '도서관', '강변', '광장', '역 앞'];
    const tasks = ['장부의 빈 칸을 정리했다', '책상과 의자를 옮겼다', '찻잔을 씻고 창문을 열었다', '날씨와 길 상태를 기록했다', '빈 상자에 번호를 붙였다'];
    return Array.from({ length }, (_, i) => ({ name: i % 2 ? 'User' : 'Mira', is_user: Boolean(i % 2), is_system: false, send_date: '2026-09-27T00:00:00.000Z', extra: {}, mes: `${theme} 기록 ${i + 1}. ${places[i % places.length]}에서 ${tasks[i % tasks.length]}. 사람들은 점심 메뉴와 구름 모양을 이야기했고, 우리는 잠시 쉬었다가 남은 일을 마무리했다.` }));
}
const long = dialogue(240, '해안 탐사');
long[6].mes = '해안 탐사에서 미라가 타는 작은 배의 고유 이름은 유리제비다. 배 이름을 물으면 유리제비라고 답하면 된다.';
long[121].mes = '탐사대의 비상 약품함은 북쪽 등대 지하의 파란 철제 서랍에 있다. 지도는 남쪽 창고에 있지만 약품함과 관계없다.';
long[238].mes = '다음 방문지는 항구 우체국으로 확정했다. 바로 다음에는 그곳으로 간다.';
const similar = dialogue(120, '박물관 준비');
similar[10].mes = '미라의 은색 열쇠는 동쪽 작업실의 붉은 상자에 있다. 미라의 금색 열쇠는 서쪽 작업실의 노란 상자에 있다.';
similar[42].mes = '유나의 은색 열쇠는 북쪽 도서관의 초록 상자에 있다. 이 열쇠는 미라의 은색 열쇠와 모양이 같지만 주인이 다르다.';
similar[80].mes = '미라의 여행 가방은 검은색이고 유나의 여행 가방은 흰색이다. 상자의 색과 여행 가방의 색을 혼동하지 말자.';
const revisions = dialogue(180, '축제 운영');
revisions[8].mes = '첫 계획에서 비상 대피 장소는 붉은 여관으로 정했다.';
revisions[51].mes = '붉은 여관이 문을 닫았다. 대피 장소를 서쪽 온실로 변경했다. 첫 계획은 취소되었다.';
revisions[96].mes = '축제 출입 암호는 초록솔방울이다. 지금 안내판에 그렇게 적혀 있다.';
revisions[127].mes = '마지막 수정이다. 서쪽 온실에도 들어갈 수 없다. 현재 최종 대피 장소는 북쪽 관측소다. 앞의 두 장소는 모두 폐기했다.';
revisions[158].mes = '암호를 바꿨다. 지금 유효한 축제 출입 암호는 은빛나뭇잎이다. 예전 초록솔방울은 더 이상 통하지 않는다.';
export const scenarios = [
    { id: 'long', messages: long, cases: [
        { id: 'early-boat', question: '미라가 해안 탐사에서 타는 배의 고유 이름은 무엇인가요?', required: ['유리제비'] },
        { id: 'middle-medicine', question: '탐사대의 비상 약품함은 정확히 어디에 있나요?', required: ['북쪽등대', '지하', '파란철제서랍'], forbidden: ['남쪽창고'] },
        { id: 'recent-destination', question: '바로 다음에 방문하기로 확정한 곳은 어디인가요?', required: ['항구우체국'] },
    ] },
    { id: 'similar', messages: similar, cases: [
        { id: 'mira-silver', question: '미라의 은색 열쇠는 정확히 어디에 있나요?', required: ['동쪽작업실', '붉은상자'], forbidden: ['서쪽작업실', '노란상자', '북쪽도서관', '초록상자'] },
        { id: 'yuna-silver', question: '유나의 은색 열쇠는 정확히 어디에 있나요?', required: ['북쪽도서관', '초록상자'], forbidden: ['동쪽작업실', '붉은상자'] },
        { id: 'unknown-locker', question: '미라의 개인 사물함 번호는 몇 번인가요?', unknown: true },
    ] },
    { id: 'revisions', messages: revisions, cases: [
        { id: 'final-shelter', question: '변경 사항을 모두 반영한 현재 최종 대피 장소는 어디인가요?', required: ['북쪽관측소'], forbidden: ['붉은여관', '서쪽온실'] },
        { id: 'current-password', question: '지금 유효한 축제 출입 암호는 무엇인가요?', required: ['은빛나뭇잎'], forbidden: ['초록솔방울'] },
        { id: 'unknown-time', question: '축제 폐막식은 정확히 몇 시에 시작하나요?', unknown: true },
    ] },
];
const orders = [ ['off', 'sillymemory', 'vectors'], ['sillymemory', 'vectors', 'off'], ['vectors', 'off', 'sillymemory'], ['vectors', 'sillymemory', 'off'], ['off', 'vectors', 'sillymemory'], ['sillymemory', 'off', 'vectors'] ];
export const samples = scenarios.flatMap((scenario, s) => Array.from({ length: repeats }, (_, repeat) => scenario.cases.flatMap((item, c) => orders[(s * 6 + repeat * 3 + c) % orders.length].map(mode => ({ scenario: scenario.id, case: item.id, repeat, mode })))) .flat());
