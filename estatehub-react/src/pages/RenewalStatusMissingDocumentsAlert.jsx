// src/pages/RenewalStatusMissingDocumentsAlert.jsx
// RETIRED: duplicate of RenewalStatusTracker + ResolveMissingDocuments (same "missing documents"
// timeline and document list, hard-coded). Consolidated into those two real pages instead of
// maintaining two parallel implementations. Redirects to the real, data-backed equivalent.

import { Navigate } from 'react-router-dom';

export default function RenewalStatusMissingDocumentsAlert() {
  return <Navigate to="/resolve-missing-documents" replace />;
}
