// Synthetic allocation controls, not a retrieval/answer quality benchmark.
export const capacityPlan = {
    version: 1,
    host: '06bde939fb1e9c4c8d8641d810f0a916b5bce127',
    model: 'gpt-4.1-mini-2025-04-14', // Tokenizer label only; completions are local.
    recent: 4,
    budget: 800,
    question: 'QUESTION: Where did Mira put the blue compass?',
    character: 'Mira is a synthetic test character. Answer only from the conversation.',
    cases: [
        { id: 'off-small', enabled: false, context: 1536, output: 256, instructions: 1, recentRepeats: 1 },
        { id: 'on-small', enabled: true, context: 1536, output: 256, instructions: 1, recentRepeats: 1 },
        { id: 'on-instructions', enabled: true, context: 1536, output: 256, instructions: 80, recentRepeats: 1 },
        { id: 'on-recent-pressure', enabled: true, context: 1536, output: 256, instructions: 1, recentRepeats: 100 },
        { id: 'on-larger-context', enabled: true, context: 4096, output: 256, instructions: 1, recentRepeats: 1 },
        { id: 'on-larger-output', enabled: true, context: 1536, output: 768, instructions: 1, recentRepeats: 1 },
    ],
};

export function capacityChat(recentRepeats) {
    return Array.from({ length: 12 }, (_, i) => ({
        name: i % 2 ? 'Mira' : 'User', is_user: i % 2 === 0, is_system: false,
        send_date: 1700000000000 + i, extra: {},
        mes: i < 9
            ? `OLD_${i}: Mira put the blue compass beneath the cedar tree. ${'We catalogued ordinary blank paper. '.repeat(8)}`
            : `RECENT_${i}: ${'We are discussing the garden. '.repeat(recentRepeats)}`,
    }));
}

export function capacityInstructions(repeats) {
    return 'Follow the conversation and answer the user accurately. '.repeat(repeats);
}
