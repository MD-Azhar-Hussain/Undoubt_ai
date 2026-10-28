import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Navigate, Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import http from '../utils/http';
import useForegroundRefresh from '../hooks/useForegroundRefresh';

function AccessState({ message, retry }) {
  return <main className="access-screen"><div className="access-card"><span className="eyebrow">Your workspace</span><h1>{retry ? 'Unable to verify access' : 'Checking access…'}</h1><p role={retry ? 'alert' : 'status'}>{message}</p>{retry && <button onClick={retry}>Try again</button>}<Link to="/">Back to my sessions</Link></div></main>;
}
AccessState.propTypes = { message: PropTypes.string, retry: PropTypes.func };

export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (loading) return <AccessState message="Preparing your session." />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}
ProtectedRoute.propTypes = { children: PropTypes.node };

// A new identity or resource mounts a fresh gate: stale permission cannot render children.
function ResourceGate({ kind, children }) {
  const { user } = useAuth();
  const { roomId, organisationId } = useParams();
  const resource = organisationId || roomId || '';
  return <ProtectedRoute><AccessCheck key={[user?.id, kind, resource].join(':')} kind={kind} resource={resource}>{children}</AccessCheck></ProtectedRoute>;
}
ResourceGate.propTypes = { kind: PropTypes.string, children: PropTypes.node };
function AccessCheck({ kind, resource, children }) {
  const { user, acceptAccess } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [focusVersion, setFocusVersion] = useState(0);
  useForegroundRefresh(() => setFocusVersion(value => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    // Keep an already verified room mounted during the request. A failed check
    // still hides children below; explicit denial still redirects immediately.
    setError('');
    const orgRoute = kind === 'organisation' && resource;
    const isRoom = ['host', 'participant', 'report'].includes(kind);
    const valid = !resource || (isRoom ? /^[a-zA-Z0-9-]{5,64}$/ : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(resource);
    if (!valid) { setResult({ denied: true }); return () => controller.abort(); }
    const url = isRoom ? '/rooms/' + resource + '/host/' + encodeURIComponent(user.id) : orgRoute ? '/organisations/' + resource : '/me';
    http.get(url, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (url === '/me') acceptAccess?.(data);
      const allowed = kind === 'platform' ? data.isPlatformAdmin : kind === 'organisation' ? (orgRoute ? ['admin','platform_admin'].includes(data.role) : data.isPlatformAdmin || data.organisations.some(org => org.role === 'admin' && org.status !== 'deleted')) : true;
      setResult({ denied: !allowed, isHost: data.isHost });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setResult(null);
      if (error.response?.status === 401) setResult({ login: true });
      else if ([400,403,404,410].includes(error.response?.status)) setResult({ denied: true });
      else setError('We could not check your access. Please retry.');
    });
    return () => controller.abort();
  }, [kind, resource, user.id, attempt, focusVersion, acceptAccess]);
  const location = useLocation();
  if (error) return <AccessState message={error} retry={() => setAttempt(value => value + 1)} />;
  if (!result) return <AccessState message="Verifying this page is available to your account." />;
  if (result.login) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (result.denied || (kind === 'report' && !result.isHost)) return <Navigate to="/access-denied" replace />;
  if (kind === 'host' && !result.isHost) return <Navigate to={'/room/' + resource} replace />;
  if (kind === 'participant' && result.isHost) return <Navigate to={'/host/' + resource} replace />;
  return children;
}
AccessCheck.propTypes = { kind: PropTypes.string, resource: PropTypes.string, children: PropTypes.node };
export const HostProtectedRoute = ({ children }) => <ResourceGate kind="host">{children}</ResourceGate>;
export const ParticipantProtectedRoute = ({ children }) => <ResourceGate kind="participant">{children}</ResourceGate>;
export const ManagementProtectedRoute = ({ children, platform = false }) => <ResourceGate kind={platform ? 'platform' : 'organisation'}>{children}</ResourceGate>;
export const ReportProtectedRoute = ({ children }) => <ResourceGate kind="report">{children}</ResourceGate>;
HostProtectedRoute.propTypes = ParticipantProtectedRoute.propTypes = ReportProtectedRoute.propTypes = { children: PropTypes.node };
ManagementProtectedRoute.propTypes = { children: PropTypes.node, platform: PropTypes.bool };
