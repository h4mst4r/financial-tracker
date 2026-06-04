import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PublicPage } from '../components/layout/PublicPage';
import { Button } from '../components/ui/Button';

export function Forbidden() {
  const navigate = useNavigate();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  return (
    <PublicPage title="Financial Tracker">
      <h2 className="text-xl font-semibold text-text-primary mb-2">403 — Not Authorized</h2>
      <p className="text-text-secondary text-sm mb-6">
        You don&apos;t have permission to access this page.
      </p>
      {currentPerson
        ? (
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
          )
        : (
          <Button variant="secondary" onClick={() => navigate('/login')}>
            Sign In
          </Button>
          )}
    </PublicPage>
  );
}
