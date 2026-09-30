import assert from 'node:assert/strict';
import { sourceExcerpt, evidenceCoverage } from './semantic-evidence.mjs';
import { semanticPromptEvidence } from './semantic-long.mjs';

export async function configureNative(page, bridgeUrl, config) {
    await page.evaluate(({ bridgeUrl, config }) => {
        globalThis.threeModeNativeCollections = [];
        $('#vectors_enabled_chats').prop('checked', false).trigger('input');
        $('#vectors_source').val(config.source).trigger('change');
        $('#vectors_vllm_model').val(config.vllm_model).trigger('input');
        $('#vector_altEndpointUrl_enabled').prop('checked', true).trigger('input');
        $('#vector_altEndpoint_address').val(bridgeUrl).trigger('change');
        for (const key of ['protect', 'query', 'insert', 'message_chunk_size', 'score_threshold', 'depth']) $(`#vectors_${key}`).val(config[key]).trigger('input');
        $('#vectors_template').val(config.template).trigger('input');
        $(`input[name="vectors_position"][value="${config.position}"]`).prop('checked', true).trigger('change');
        const actual = SillyTavern.getContext().extensionSettings.vectors;
        for (const [key, value] of Object.entries(config)) if (actual[key] !== value) throw new Error(`Native setting mismatch: ${key}`);
    }, { bridgeUrl, config });
}
export async function setNative(page, enabled) {
    await page.evaluate(enabled => { $('#vectors_enabled_chats').prop('checked', enabled).trigger('input'); }, enabled);
}
export async function indexNative(page) {
    return page.evaluate(async () => {
        const c = SillyTavern.getContext(), v = c.extensionSettings.vectors, collectionId = c.getCurrentChatId();
        globalThis.threeModeNativeCollections.push(collectionId);
        $('#vectors_enabled_chats').prop('checked', true).trigger('input');
        await $('#vectors_vectorize_all').triggerHandler('click');
        const response = await fetch('/api/vector/list', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ collectionId, source: v.source, model: v.vllm_model, apiUrl: v.alt_endpoint_url }) });
        if (!response.ok) throw new Error('Native vector list failed');
        const actual = [...new Set(await response.json())].sort();
        const { getStringHash } = await import('/scripts/utils.js');
        const expected = [...new Set(c.chat.map(m => getStringHash(m.mes)))].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Native index differs from restored source');
        return { collectionId, hashes: actual, expected };
    });
}
export async function purgeNativeCollections(page) {
    return page.evaluate(async () => {
        $('#vectors_enabled_chats').prop('checked', false).trigger('input');
        const c = SillyTavern.getContext(), v = c.extensionSettings.vectors, results = [];
        for (const collectionId of [...new Set(globalThis.threeModeNativeCollections || [])]) {
            const body = JSON.stringify({ collectionId, source: v.source, model: v.vllm_model, apiUrl: v.alt_endpoint_url });
            const options = { method: 'POST', headers: c.getRequestHeaders(), body };
            const purge = await fetch('/api/vector/purge', options), list = await fetch('/api/vector/list', options);
            if (!purge.ok || !list.ok) throw new Error('Native purge/list failed');
            const remaining = await list.json(); if (remaining.length) throw new Error('Native collection not empty');
            results.push({ collectionId, purgeStatus: purge.status, listStatus: list.status, remaining });
        }
        return results;
    });
}
export function nativePromptEvidence(item, nativePrompt, outgoing) {
    assert(typeof nativePrompt === 'string');
    const prompt = outgoing.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const selected = [];
    // The native extension inserts whole messages with speaker labels, as a single block.
    // Require that exact block in the captured request before crediting any source.
    if (nativePrompt) {
        assert(prompt.includes(nativePrompt.trim()), 'Native prompt missing from outgoing request');
        for (const [index, message] of item.messages.entries()) {
            const formatted = `${message.speaker}: ${message.text}`.replace(/\n{3,}/g, '\n\n').trim();
            if (nativePrompt.includes(formatted)) selected.push(sourceExcerpt(item, index, 0, message.text.length));
        }
        assert(selected.length, 'Native prompt does not match any source messages');
    }
    // Source left in the regular chat also counts, with its original role.
    const delivered = [...selected];
    for (const [index, message] of item.messages.entries()) if (outgoing.some(m => m.role === message.role && typeof m.content === 'string' && m.content.includes(message.text))) delivered.push(sourceExcerpt(item, index, 0, message.text.length));
    return { memory: evidenceCoverage(item, selected), prompt: evidenceCoverage(item, delivered) };
}
export function threeModeEvidence(item, row, outgoing) {
    return row.mode === 'vectors' ? nativePromptEvidence(item, row.nativePrompt, outgoing) : semanticPromptEvidence(item, row.passages, outgoing);
}
