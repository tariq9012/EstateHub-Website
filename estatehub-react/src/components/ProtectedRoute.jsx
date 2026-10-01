// src/components/ProtectedRoute.jsx
// Wrap a route element: redirects to /sign-in if not logged in, or to "/"
// if logged in but the wrong role. Usage in App.jsx:
//   <Route path="/user-dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
//   <Route path="/admin-dashboard" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}