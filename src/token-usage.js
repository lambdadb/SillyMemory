const validCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const tokenLabel = value => validCount(value) ? `~${Math.round(value).toLocaleString('en-US')}` : 'Unavailable';

// Read already-counted, plain-text host messages. Never rebuild a prompt or
// attribute a stale counter to a packet modified by another extension.
export function hostPromptTokens(manager, prompt) {
    try {
        if (!Array.isArray(prompt) || !prompt.length) return undefined;
        const messages = manager.messages.flatten().filter(message => message.content || message.tool_calls);
        if (messages.some(message => typeof message.content !== 'string' || message.tool_calls || message.signature || message.reasoning)) return undefined;
        const counted = messages.map(message => ({ role: message.role, content: message.content, ...(message.name ? { name: message.name } : {}) }));
        if (JSON.stringify(counted) !== JSON.stringify(prompt)) return undefined;
        const counts = messages.map(message => message.getTokens());
        return counts.every(validCount) ? counts.reduce((sum, count) => sum + count, 0) : undefined;
    } catch { return undefined; }
}

export function dialogueSnapshot(messages) {
    return messages.map(({ mes, is_user, is_system }) => ({ mes, is_user, is_system }));
}

export function dialogueText(messages, guidance = '') {
    return [guidance && `System: ${guidance}`, ...messages.map(message => `${message.is_system ? 'System' : message.is_user ? 'User' : 'Assistant'}: ${message.mes}`)].filter(Boolean).join('\n\n');
}

export async function compareDialogue(before, after, guidance, count) {
    const [original, prepared] = await Promise.all([count(dialogueText(before)), count(dialogueText(after, guidance))]);
    if (!validCount(original) || !validCount(prepared)) throw new Error('Token estimate unavailable.');
    return { before: original, after: prepared };
}

export function comparisonLabel({ before, after }) {
    const difference = Math.abs(before - after);
    const percent = before > 0 ? `, ${Math.round(difference / before * 100)}%` : '';
    return `${tokenLabel(before)} → ${tokenLabel(after)} tokens${difference ? ` (${tokenLabel(difference)}${percent} ${after < before ? 'less' : 'more'})` : ' (unchanged)'}`;
}
