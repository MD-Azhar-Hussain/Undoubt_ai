import { Link, useNavigate } from 'react-router-dom';
import { logOut } from '../config/firebase';
import { toast } from 'react-toastify';
export default function AccessDeniedPage() {
  const navigate = useNavigate();
  async function switchAccount() {
    try { await logOut(); navigate('/login', { replace: true }); } catch { toast.error('Could not sign out. Please retry.'); }
  }
  return <main className="access-screen"><section className="access-card"><span className="eyebrow">Account access</span><h1>This page isn’t available</h1><p>Your account doesn’t have access to this page, or the workspace is no longer available. Contact its administrator if you need access.</p><Link to="/">Back to my sessions</Link><button onClick={switchAccount}>Switch account</button></section></main>;
}
