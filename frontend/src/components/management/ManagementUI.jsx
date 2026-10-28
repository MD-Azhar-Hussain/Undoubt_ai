import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import http from '../../utils/http';
import { errorText, date } from './format';
export function Page({ title, intro, children }) {
  return <main className="management-page"><header className="management-heading"><p className="eyebrow"><span aria-hidden="true">✦</span> UnDoubt workspace</p><h1>{title}</h1><p>{intro}</p></header>{children}</main>;
}
Page.propTypes = { title: PropTypes.string, intro: PropTypes.string, children: PropTypes.node };

export function Notice({ children, error = false }) {
  return children ? <p className={`management-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null;
}
Notice.propTypes = { children: PropTypes.node, error: PropTypes.bool };

export function Collection({ url, renderItem, empty, cursorKey = 'after' }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    http.get(url, { params: cursor ? { [cursorKey]: cursor } : {}, signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setItems(previous => cursor ? [...previous, ...data.items] : data.items);
      setNext(data.nextCursor);
    }).catch(error => { if (!controller.signal.aborted) { setError(errorText(error)); if ([401,403,404].includes(error.response?.status)) setItems([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, cursor, cursorKey, retry]);
  const filtered = items.filter(item => Object.values(item).some(value => String(value ?? '').toLowerCase().includes(filter.toLowerCase())));
  return <>
    {items.length > 0 && <label className="collection-search">Filter loaded results<input type="search" placeholder="Type to filter…" value={filter} onChange={e => setFilter(e.target.value)} /></label>}
    <div className="management-list">{filtered.map(renderItem)}</div>
    {filter && !filtered.length && <p role="status" className="management-empty">No matching records in this list.</p>}
    {filter && <p className="management-help">Filtering {items.length} loaded records. Load more to include earlier pages.</p>}
    {loading && <Notice>Loading…</Notice>}
    {!loading && !error && !items.length && <p className="management-empty">{empty}</p>}
    <Notice error>{error}</Notice>
    {error ? <button className="secondary" disabled={loading} onClick={() => setRetry(value => value + 1)}>Retry</button> : next && <button className="secondary" disabled={loading} onClick={() => setCursor(next)}>Load more</button>}
  </>;
}
Collection.propTypes = { url: PropTypes.string.isRequired, renderItem: PropTypes.func.isRequired, empty: PropTypes.string, cursorKey: PropTypes.string };

export function Audit({ url }) {
  const labels = { 'organisation.created': 'Organisation created', 'organisation.updated': 'Organisation settings updated', 'membership.updated': 'Member access updated', 'session.created': 'Session created', 'session.closed': 'Session closed', 'platform.access_granted': 'Platform access granted', 'question.answered': 'Question answered or reply updated', 'session.topic_updated': 'Session topic updated' };
  return <section className="management-panel"><h2>Activity log</h2><p className="management-help">A record of administrative changes and session lifecycle events.</p>
    <Collection url={url} cursorKey="before" empty="No activity yet." renderItem={item => <article className="audit-item" key={item.id}>
      <div><strong>{labels[item.action] || item.action}</strong><time dateTime={item.created_at}>{date(item.created_at)}</time></div>
      <p className="break-text">{item.target}</p><details><summary>Details</summary><p className="break-text">Account ID: {item.actor_id}</p>{Object.entries(item.details).map(([key, value]) => <p className="break-text" key={key}>{key.replace(/([A-Z])/g, ' $1')}: {value === null ? 'None' : String(value)}</p>)}</details>
    </article>} />
  </section>;
}
Audit.propTypes = { url: PropTypes.string.isRequired };

export function SectionNav({ sections, selected, onSelect }) {
  return <nav className="management-sections" aria-label="Management sections">{sections.map(section => <button key={section.id} aria-pressed={selected === section.id} onClick={() => onSelect(section.id)}>{section.label}</button>)}</nav>;
}
SectionNav.propTypes = { sections: PropTypes.array.isRequired, selected: PropTypes.string, onSelect: PropTypes.func };
