import { useNavigate } from 'react-router-dom';
import { PublicPage } from '../components/layout/PublicPage';
import { Button } from '../components/ui/Button';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <PublicPage title="Financial Tracker">
      <h2 className="text-xl font-semibold text-text-primary mb-2">404 — Page Not Found</h2>
      <p className="text-text-secondary text-sm mb-6">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button variant="secondary" onClick={() => navigate('/dashboard')}>
        Go to Dashboard
      </Button>
    </PublicPage>
  );
}
