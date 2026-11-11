// Applies SillyTavern prompt-only regex scripts the way native history does,
// without the host's macro substitution. Capture runs repeatedly for sync and
// source checks, so it must be deterministic and free of side effects: a script
// whose find, replacement or trim strings use macros is not applied to memory.
// Placement values match the host's regex_placement.
export const USER_INPUT = 1, AI_OUTPUT = 2;

const usesMacros = script => Number(script.substituteRegex || 0) !== 0
    || String(script.replaceString ?? '').replace(/\{\{match\}\}/gi, '').includes('{{')
    || (script.trimStrings || []).some(trim => String(trim).includes('{{'));
const set = value => value !== null && value !== undefined && !Number.isNaN(Number(value));

// compile(findRegex) returns the host's RegExp for a script, or null if invalid.
export function promptRegex(scripts, compile) {
    const active = (scripts || []).filter(script => script && script.promptOnly && !script.disabled && script.findRegex && !usesMacros(script));
    return (text, isUser, depth) => {
        const placement = isUser ? USER_INPUT : AI_OUTPUT;
        let out = text;
        for (const script of active) {
            if (!out || !script.placement?.includes(placement)) continue;
            if (set(script.minDepth) && script.minDepth >= -1 && depth < script.minDepth) continue;
            if (set(script.maxDepth) && script.maxDepth >= 0 && depth > script.maxDepth) continue;
            const find = compile(script.findRegex);
            if (!find) continue;
            out = out.replace(find, (...args) => {
                const groups = args.at(-1);
                return String(script.replaceString ?? '').replace(/\{\{match\}\}/gi, '$0').replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, name) => {
                    const value = num ? args[Number(num)] : groups && typeof groups === 'object' ? groups[name] : undefined;
                    if (!value) return '';
                    return (script.trimStrings || []).reduce((result, trim) => result.replaceAll(trim, ''), String(value));
                });
            });
        }
        return out;
    };
}
