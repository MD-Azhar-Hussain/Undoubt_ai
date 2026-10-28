import { useRef, useState } from 'react';

const MAX_AGE = 24 * 60 * 60 * 1000;
const blank = () => ({ text: '', requestId: null });
export const questionDraftKey = (userId, roomId) => `undoubt:question-draft:${encodeURIComponent(userId)}:${encodeURIComponent(roomId)}`;

function readDraft(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    if (value?.version === 1 && typeof value.text === 'string' && value.text.length <= 2000 &&
      Number.isFinite(value.savedAt) && Date.now() - value.savedAt < MAX_AGE && value.savedAt <= Date.now() &&
      (value.requestId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId))) return value;
    sessionStorage.removeItem(key);
  } catch { /* Private browsing or storage policies must not prevent writing. */ }
  return blank();
}

// The room component is keyed by account and room, so drafts cannot cross either boundary.
export default function useQuestionDraft(userId, roomId) {
  const key = questionDraftKey(userId, roomId);
  const [draft, setDraft] = useState(() => readDraft(key));
  const current = useRef(draft);
  const [saved, setSaved] = useState(() => !!draft.text);
  const persist = next => {
    current.current = next;
    setDraft(next);
    try {
      if (next.text) sessionStorage.setItem(key, JSON.stringify({ ...next, version: 1, savedAt: Date.now() }));
      else sessionStorage.removeItem(key);
      setSaved(!!next.text);
    } catch { setSaved(false); }
  };
  const setText = text => persist({ text, requestId: text.trim() === current.current.text.trim() ? current.current.requestId : null });
  const prepare = () => {
    const next = { ...current.current, requestId: current.current.requestId || crypto.randomUUID() };
    persist(next);
    return { text: next.text.trim(), requestId: next.requestId };
  };
  const acknowledge = submission => {
    if (current.current.requestId !== submission.requestId) return false;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key));
      if (stored && stored.requestId !== submission.requestId) return false;
    } catch { /* Still clear the in-memory draft if storage is unavailable. */ }
    persist(blank());
    return true;
  };
  return { text: draft.text, saved, setText, prepare, acknowledge };
}
