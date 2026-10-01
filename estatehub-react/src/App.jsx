import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const AdminReviewQueue = lazy(() => import('./pages/AdminReviewQueue.jsx'));
const AgentCertificationTracking = lazy(() => import('./pages/AgentCertificationTracking.jsx'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard.jsx'));
const AgentInquiries = lazy(() => import('./pages/AgentInquiries.jsx'));
const AgentNotifications = lazy(() => import('./pages/AgentNotifications.jsx'));
import AgentProfile from './pages/AgentProfile.jsx';
const AgentReviews = lazy(() => import('./pages/AgentReviews.jsx'));
const AgentSettings = lazy(() => import('./pages/AgentSettings.jsx'));
const AgentVerification = lazy(() => import('./pages/AgentVerification.jsx'));
const AgentVerificationQueue = lazy(() => import('./pages/AgentVerificationQueue.jsx'));
const AgentVerificationReview = lazy(() => import('./pages/AgentVerificationReview.jsx'));
const AgentVerificationReviewDetail = lazy(() => import('./pages/AgentVerificationReviewDetail.jsx'));
import BrowseProperties from './pages/BrowseProperties.jsx';
import FindAnAgent from './pages/FindAnAgent.jsx';
import Home from './pages/Home.jsx';
const LicenseRenewalDocumentUpload = lazy(() => import('./pages/LicenseRenewalDocumentUpload.jsx'));
const LicenseRenewalReviewSubmit = lazy(() => import('./pages/LicenseRenewalReviewSubmit.jsx'));
const ListYourProperty = lazy(() => import('./pages/ListYourProperty.jsx'));
const ManageProperties = lazy(() => import('./pages/ManageProperties.jsx'));
const ManageUsers = lazy(() => import('./pages/ManageUsers.jsx'));
const MyListings = lazy(() => import('./pages/MyListings.jsx'));
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Appointments = lazy(() => import('./pages/Appointments.jsx'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings.jsx'));
import PropertyDetails from './pages/PropertyDetails.jsx';
const RenewalAlertPreview = lazy(() => import('./pages/RenewalAlertPreview.jsx'));
const RenewalStatusMissingDocumentsAlert = lazy(() => import('./pages/RenewalStatusMissingDocumentsAlert.jsx'));
const RenewalStatusTracker = lazy(() => import('./pages/RenewalStatusTracker.jsx'));
const ResolveMissingDocuments = lazy(() => import('./pages/ResolveMissingDocuments.jsx'));
import ForgotPassword from './pages/ForgotPassword.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
const ResubmissionSuccess = lazy(() => import('./pages/ResubmissionSuccess.jsx'));
import SignIn from './pages/SignIn.jsx';
const SubmissionSuccess = lazy(() => import('./pages/SubmissionSuccess.jsx'));
const SubmitLicenseRenewal = lazy(() => import('./pages/SubmitLicenseRenewal.jsx'));
const UserDashboard = lazy(() => import('./pages/UserDashboard.jsx'));
import ProtectedRoute from './components/ProtectedRoute.jsx';

function PageTitle({ title, children }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return children;
}

function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">
      <span className="text-body-md font-body-md">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
          {/* Public */}
          <Route path="/" element={<PageTitle title="EstateHub - Premium Real Estate"><Home /></PageTitle>} />
          <Route path="/browse-properties" element={<PageTitle title="EstateHub - Property Discovery"><BrowseProperties /></PageTitle>} />
          <Route path="/property-details/:id" element={<PageTitle title="EstateHub - Property Details"><PropertyDetails /></PageTitle>} />
          <Route path="/find-an-agent" element={<PageTitle title="EstateHub - Agent Marketplace"><FindAnAgent /></PageTitle>} />
          <Route path="/agent-profile/:id?" element={<PageTitle title="EstateHub - Agent Profile"><AgentProfile /></PageTitle>} />
          <Route path="/sign-in" element={<PageTitle title="EstateHub - Sign In"><SignIn /></PageTitle>} />
          <Route path="/register" element={<PageTitle title="EstateHub - Create Account"><Register /></PageTitle>} />
          <Route path="/forgot-password" element={<PageTitle title="EstateHub - Forgot Password"><ForgotPassword /></PageTitle>} />
          <Route path="/reset-password" element={<PageTitle title="EstateHub - Reset Password"><ResetPassword /></PageTitle>} />

          {/* Authenticated (any logged-in role) */}
          <Route path="/user-dashboard" element={<PageTitle title="EstateHub - Dashboard"><ProtectedRoute><UserDashboard /></ProtectedRoute></PageTitle>} />
          <Route path="/appointments" element={<PageTitle title="EstateHub - Appointments"><ProtectedRoute><Appointments /></ProtectedRoute></PageTitle>} />
          <Route path="/messages" element={<PageTitle title="EstateHub - Messages"><ProtectedRoute><Messages /></ProtectedRoute></PageTitle>} />
          <Route path="/list-your-property" element={<PageTitle title="EstateHub - List Your Property"><ProtectedRoute roles={['agent', 'admin']}><ListYourProperty /></ProtectedRoute></PageTitle>} />
          <Route path="/edit-property/:id" element={<PageTitle title="EstateHub - Edit Property"><ProtectedRoute roles={['agent', 'admin']}><ListYourProperty /></ProtectedRoute></PageTitle>} />
          <Route path="/submission-success" element={<PageTitle title="Submission Success - EstateHub"><ProtectedRoute><SubmissionSuccess /></ProtectedRoute></PageTitle>} />

          {/* Agent only */}
          <Route path="/agent-dashboard" element={<PageTitle title="EstateHub - Agent Dashboard"><ProtectedRoute roles={['agent']}><AgentDashboard /></ProtectedRoute></PageTitle>} />
          <Route path="/my-listings" element={<PageTitle title="EstateHub - My Listings"><ProtectedRoute roles={['agent']}><MyListings /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-inquiries" element={<PageTitle title="EstateHub - Inquiries"><ProtectedRoute roles={['agent']}><AgentInquiries /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-reviews" element={<PageTitle title="EstateHub - Reviews"><ProtectedRoute roles={['agent']}><AgentReviews /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-verification" element={<PageTitle title="EstateHub - Verification"><ProtectedRoute roles={['agent']}><AgentVerification /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-notifications" element={<PageTitle title="EstateHub - Notifications"><ProtectedRoute roles={['agent']}><AgentNotifications /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-settings" element={<PageTitle title="EstateHub - Profile & Settings"><ProtectedRoute roles={['agent']}><AgentSettings /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-certification-tracking" element={<PageTitle title="EstateHub - Certification Tracking"><ProtectedRoute roles={['agent']}><AgentCertificationTracking /></ProtectedRoute></PageTitle>} />
          <Route path="/submit-license-renewal" element={<PageTitle title="EstateHub - License Renewal"><ProtectedRoute roles={['agent']}><SubmitLicenseRenewal /></ProtectedRoute></PageTitle>} />
          <Route path="/license-renewal-document-upload" element={<PageTitle title="EstateHub - License Renewal Step 2"><ProtectedRoute roles={['agent']}><LicenseRenewalDocumentUpload /></ProtectedRoute></PageTitle>} />
          <Route path="/license-renewal-review-submit" element={<PageTitle title="EstateHub - License Renewal - Review & Submit"><ProtectedRoute roles={['agent']}><LicenseRenewalReviewSubmit /></ProtectedRoute></PageTitle>} />
          <Route path="/renewal-alert-preview" element={<PageTitle title="EstateHub - License Renewal Alert"><ProtectedRoute roles={['agent']}><RenewalAlertPreview /></ProtectedRoute></PageTitle>} />
          <Route path="/renewal-status-missing-documents-alert" element={<PageTitle title="EstateHub - Agent Compliance"><ProtectedRoute roles={['agent']}><RenewalStatusMissingDocumentsAlert /></ProtectedRoute></PageTitle>} />
          <Route path="/renewal-status-tracker" element={<PageTitle title="EstateHub - Agent Compliance"><ProtectedRoute roles={['agent']}><RenewalStatusTracker /></ProtectedRoute></PageTitle>} />
          <Route path="/resolve-missing-documents" element={<PageTitle title="Resolve Missing Documents - EstateHub"><ProtectedRoute roles={['agent']}><ResolveMissingDocuments /></ProtectedRoute></PageTitle>} />
          <Route path="/resubmission-success" element={<PageTitle title="Resubmission Successful - EstateHub"><ProtectedRoute roles={['agent']}><ResubmissionSuccess /></ProtectedRoute></PageTitle>} />

          {/* Admin only */}
          <Route path="/admin-dashboard" element={<PageTitle title="EstateHub - Admin Dashboard"><ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute></PageTitle>} />
          <Route path="/admin-review-queue" element={<PageTitle title="Admin Review Queue - EstateHub"><ProtectedRoute roles={['admin']}><AdminReviewQueue /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-verification-queue" element={<PageTitle title="Agent Verification Queue - EstateHub"><ProtectedRoute roles={['admin']}><AgentVerificationQueue /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-verification-review" element={<PageTitle title="EstateHub - Agent Verification Review"><ProtectedRoute roles={['admin']}><AgentVerificationReview /></ProtectedRoute></PageTitle>} />
          <Route path="/agent-verification-review-detail" element={<PageTitle title="Agent Verification Review - EstateHub"><ProtectedRoute roles={['admin']}><AgentVerificationReviewDetail /></ProtectedRoute></PageTitle>} />
          <Route path="/manage-properties" element={<PageTitle title="EstateHub - Property Management"><ProtectedRoute roles={['admin']}><ManageProperties /></ProtectedRoute></PageTitle>} />
          <Route path="/manage-users" element={<PageTitle title="EstateHub - Manage Users"><ProtectedRoute roles={['admin']}><ManageUsers /></ProtectedRoute></PageTitle>} />
          <Route path="/notification-settings" element={<PageTitle title="Notification Settings - EstateHub"><ProtectedRoute roles={['admin']}><NotificationSettings /></ProtectedRoute></PageTitle>} />
          <Route path="/admin-audit-log" element={<PageTitle title="Audit Log - EstateHub"><ProtectedRoute roles={['admin']}><AdminAuditLog /></ProtectedRoute></PageTitle>} />
          {/* DocumentPreviewModal / DocumentRejectionReasonsModal were non-functional standalone
              mockup pages with no way to reach them meaningfully on their own; they are now
              reusable components rendered inline from AgentVerificationReview and
              AdminReviewQueue instead (see components/admin/). */}
    </Routes>
    </Suspense>
  );
}