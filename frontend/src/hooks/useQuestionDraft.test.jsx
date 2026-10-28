import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useQuestionDraft, { questionDraftKey } from './useQuestionDraft';
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('question draft recovery', () => {
  it('isolates drafts by account and room', () => {
    const author = renderHook(() => useQuestionDraft('a', 'room-one'));
    act(() => author.result.current.setText('Private draft'));
    const otherAccount = renderHook(() => useQuestionDraft('b', 'room-one'));
    const otherRoom = renderHook(() => useQuestionDraft('a', 'room-two'));
    expect(otherAccount.result.current.text).toBe('');
    expect(otherRoom.result.current.text).toBe('');
    author.unmount();
    expect(renderHook(() => useQuestionDraft('a', 'room-one')).result.current.text).toBe('Private draft');
  });
  it('expires old drafts and discards malformed storage safely', () => {
    const key = questionDraftKey('a', 'r');
    sessionStorage.setItem(key, JSON.stringify({ version: 1, text: 'Expired', savedAt: Date.now() - 25 * 3600000, requestId: null }));
    const expired = renderHook(() => useQuestionDraft('a', 'r'));
    expect(expired.result.current.text).toBe(''); expired.unmount();
    sessionStorage.setItem(key, '{not json');
    expect(renderHook(() => useQuestionDraft('a', 'r')).result.current.text).toBe('');
  });
  it('allows writing and submitting if browser storage is blocked', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('Blocked'); } });
    const { result } = renderHook(() => useQuestionDraft('a', 'r'));
    act(() => result.current.setText('In memory'));
    expect(result.current.text).toBe('In memory'); expect(result.current.saved).toBe(false);
    let submission;
    act(() => { submission = result.current.prepare(); });
    expect(submission.text).toBe('In memory');
    act(() => result.current.acknowledge(submission));
    expect(result.current.text).toBe('');
  });
  it('does not let an old page acknowledgement remove a newer page draft', () => {
    const old = renderHook(() => useQuestionDraft('a', 'r'));
    act(() => old.result.current.setText('First'));
    let submission;
    act(() => { submission = old.result.current.prepare(); });
    const acknowledgeOld = old.result.current.acknowledge;
    old.unmount();
    const next = renderHook(() => useQuestionDraft('a', 'r'));
    act(() => next.result.current.setText('Newer draft'));
    act(() => acknowledgeOld(submission));
    expect(JSON.parse(sessionStorage.getItem(questionDraftKey('a', 'r'))).text).toBe('Newer draft');
  });
});
