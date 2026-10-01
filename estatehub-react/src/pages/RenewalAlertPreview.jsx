// src/pages/RenewalAlertPreview.jsx
// RETIRED: this page was a static mockup of an EMAIL template ("Action Required: Your License is
// Expiring Soon", a fake license number, a fake expiry date). EstateHub sends email only for password
// reset (Gmail SMTP), and license alerts are in-app notifications (GET /notifications) — so there is
// no real data source for an email preview, and inventing one would violate "do not create fake notifications just to populate UI".
// The equivalent real information (a live countdown to license expiry) is already shown on the
// Agent Dashboard alerts and on Verification / Certification Tracking. This route redirects there.

import { Navigate } from 'react-router-dom';

export default function RenewalAlertPreview() {
  return <Navigate to="/agent-certification-tracking" replace />;
}
