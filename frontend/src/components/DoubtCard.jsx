import PropTypes from 'prop-types';
import { useState } from 'react';
import { FaCheckCircle, FaEye, FaEyeSlash, FaArrowRight } from 'react-icons/fa';
import { AiFillStar, AiOutlineStar } from 'react-icons/ai';

const DoubtCard = ({
  doubt,
  isAnswered = false,
  upvotedDoubts,
  role,
  visibleEmails,
  recentlyAnswered,
  onToggleEmailVisibility,
  onMarkAsAnswered,
  onToggleUpvote,
  onReply,
  connected = true,
  closed = false,
  voting = false,
  answering = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [replyError, setReplyError] = useState('');
  const saveReply = async e => {
    e.preventDefault();
    if (saving || !reply.trim()) return;
    setSaving(true);
    setReplyError('');
    try {
      if (await onReply(doubt.id, reply)) setEditing(false);
      else setReplyError('Your reply was not saved. Your draft is still here—try again when connected.');
    }
    catch { setReplyError('Your reply was not saved. Your draft is still here—please try again.'); }
    finally { setSaving(false); }
  };
  const isUpvoted = upvotedDoubts.has(doubt.id);
  const badgeColorClasses = isAnswered
    ? 'text-emerald-200 border-emerald-400/40 bg-emerald-900/20'
    : isUpvoted
      ? 'text-yellow-200 border-yellow-400/40 bg-yellow-900/20'
      : 'text-blue-200 border-blue-400/40 bg-blue-900/20';

  const dotColorClass = isAnswered ? 'bg-emerald-300' : isUpvoted ? 'bg-yellow-300' : 'bg-blue-300';

  return (
    <div
      className={`doubt-card relative p-4 mb-4 rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl transform hover:scale-[1.01] ${
        isAnswered
          ? 'bg-emerald-900/30 border border-emerald-400/30'
          : 'bg-gray-900/50 border border-blue-500/30'
      } ${isAnswered && recentlyAnswered.has(doubt.id) ? 'doubt-slide-in answered-sweep' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {doubt.isOwn && <span className="text-xs text-blue-200">Your question</span>}
          <p className={`question-text text-base sm:text-lg whitespace-pre-wrap break-words font-medium mb-3 ${isAnswered ? 'text-emerald-200' : 'text-gray-100'}`}>
            {doubt.text}
          </p>
          <div className="doubt-footer flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <span
                className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold border ${badgeColorClasses} ${
                  isUpvoted && !isAnswered ? 'ring-1 ring-yellow-400/30 scale-[1.02]' : ''
                } transition-transform`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${dotColorClass}`}></span>
                {doubt.upvotes} upvotes
              </span>
              {isAnswered && (
                <span className="text-sm text-emerald-300 font-semibold flex items-center">
                  <FaCheckCircle className="mr-1" />
                  Answered
                </span>
              )}
            </div>
            <div className="doubt-actions flex items-center gap-3 flex-wrap justify-end">
              {role === 'host' && (
                <>
                  <button disabled={!connected || saving || answering || editing} onClick={() => { setReply(doubt.answer || ''); setReplyError(''); setEditing(true); }} className="px-3 py-2 rounded-lg bg-blue-700 text-white">{doubt.answer ? 'Edit reply' : 'Reply'}</button>
                  <button
                    onClick={() => onToggleEmailVisibility(doubt.id)}
                    className="px-3 py-2 text-gray-200 hover:text-white bg-gray-700/30 hover:bg-gray-700/50 border border-gray-500/30 rounded-lg transition-colors shrink-0 flex items-center gap-2"
                    title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                  >
                    {visibleEmails.has(doubt.id) ? <FaEyeSlash /> : <FaEye />}
                    <span className="text-sm">Email</span>
                  </button>
                  {visibleEmails.has(doubt.id) && (
                    <span className="text-xs text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700 max-w-[60vw] sm:max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                      {doubt.user}
                    </span>
                  )}
                  <span className="hidden sm:block w-px h-6 bg-white/10" />
                  {!isAnswered && (
                    <button
                      onClick={() => onMarkAsAnswered(doubt.id)}
                      disabled={!connected || saving || answering}
                      aria-busy={answering}
                      className="px-3 py-2 text-emerald-100 bg-emerald-700/30 hover:bg-emerald-600/40 border border-emerald-400/40 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                      title="Mark as answered"
                    >
                      <FaArrowRight className="text-xl" />
                      <span className="text-sm font-semibold">{answering ? 'Saving…' : 'Mark answered'}</span>
                    </button>
                  )}
                </>
              )}
              {role !== 'host' && (
                <button
                  onClick={() => onToggleUpvote(doubt.id)}
                  disabled={!connected || closed || voting}
                  aria-busy={voting}
                  className={`vote-button p-2 rounded-full transition-all duration-200 ${
                    upvotedDoubts.has(doubt.id)
                      ? 'text-yellow-300 bg-yellow-900/20 ring-1 ring-yellow-400/30'
                      : 'text-gray-400 hover:text-yellow-300 hover:bg-yellow-900/10'
                  }`}
                  aria-pressed={isUpvoted}
                  title={upvotedDoubts.has(doubt.id) ? 'Remove upvote' : 'Upvote'}
                >
                  <span>{voting ? 'Saving vote…' : isUpvoted ? 'Upvoted' : 'Upvote'}</span>
                  {upvotedDoubts.has(doubt.id) ? (
                    <AiFillStar className="text-xl" />
                  ) : (
                    <AiOutlineStar className="text-xl" />
                  )}
                </button>
              )}
            </div>
          </div>
          {(doubt.answer || saving) && <div className="host-reply mt-4 border-l-2 border-emerald-400 bg-emerald-950/40 rounded-r-lg p-4" aria-busy={saving}>
            <p className="text-sm font-semibold text-emerald-200">{saving ? 'Sending reply…' : 'Host reply'}</p>
            <p className="reply-text mt-2 whitespace-pre-wrap break-words text-gray-100">{saving ? reply : doubt.answer}</p>
            {!saving && doubt.answeredAt && <p className="text-xs text-gray-300 mt-2">Updated {new Date(doubt.answeredAt).toLocaleString()}</p>}
          </div>}
          {editing && role === 'host' && <form onSubmit={saveReply} className="mt-4 space-y-3">
            <label htmlFor={`reply-${doubt.id}`} className="block text-sm font-medium">Your reply</label>
            <textarea id={`reply-${doubt.id}`} autoFocus maxLength={5000} value={reply} onChange={e => { setReply(e.target.value); setReplyError(''); }} disabled={saving} className="w-full min-h-32 rounded-lg border border-white/25 bg-gray-950 p-3" />
            {replyError && <p className="interaction-error" role="alert">{replyError}</p>}
            <p className="text-xs text-gray-300">{reply.length}/5000 · Saving also marks this question answered.</p>
            <div className="flex flex-wrap gap-3"><button disabled={!connected || saving || !reply.trim()} className="px-4 py-2 bg-emerald-700 rounded-lg">{saving ? 'Saving…' : 'Save reply'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg bg-white/10">Cancel</button></div>
          </form>}
        </div>
      </div>
    </div>
  );
};

export default DoubtCard;

DoubtCard.propTypes = { doubt: PropTypes.shape({ id: PropTypes.string, text: PropTypes.string, user: PropTypes.string, upvotes: PropTypes.number, isOwn: PropTypes.bool, answer: PropTypes.string, answeredAt: PropTypes.string }).isRequired,
 isAnswered: PropTypes.bool, upvotedDoubts: PropTypes.instanceOf(Set).isRequired, role: PropTypes.string, visibleEmails: PropTypes.instanceOf(Set).isRequired, recentlyAnswered: PropTypes.instanceOf(Set).isRequired,
 onToggleEmailVisibility: PropTypes.func, onMarkAsAnswered: PropTypes.func, onToggleUpvote: PropTypes.func, onReply: PropTypes.func, connected: PropTypes.bool, closed: PropTypes.bool, voting: PropTypes.bool, answering: PropTypes.bool };
