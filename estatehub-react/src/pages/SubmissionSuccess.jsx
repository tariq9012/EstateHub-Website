// src/pages/SubmissionSuccess.jsx
// Generic success screen after ListYourProperty (create) or a license renewal submission.
// Reads what actually happened from router state — no hard-coded reference numbers or copy.
//   location.state = { kind: 'property', propertyId, isDraft } | { kind: 'renewal', renewalId }

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../components/AccountSidebar';
import { Icon } from '../components/agent/agentUi';
import { renewalReference } from '../components/agent/useRenewalData';

const PROPERTY_STEPS = [
  { title: 'Admin review', body: 'Our team checks your listing details and photos.' },
  { title: 'Approval', body: 'Once approved, your listing goes live to buyers.' },
  { title: 'Manage it anytime', body: 'Track status and make changes from My Listings.' },
];
const RENEWAL_STEPS = [
  { title: 'Admin review', body: 'Our team reviews your uploaded documents for completeness.' },
  { title: 'Verification', body: 'We verify your license details.' },
  { title: 'Decision', body: 'You’ll be notified, and your dashboard will show the result.' },
];

export default function SubmissionSuccess() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};
  const kind = state.kind || 'property';
  const isDraft = kind === 'property' && state.isDraft;

  const heading = kind === 'renewal' ? 'Renewal submitted!' : isDraft ? 'Draft saved!' : 'Listing submitted for review!';
  const body =
    kind === 'renewal'
      ? 'Your license renewal documents were uploaded and sent for review. This usually takes a few business days.'
      : isDraft
        ? 'Your listing was saved as a draft. It is not visible to buyers until you submit it for review.'
        : 'Your listing has been sent to our team for review. It will go live once approved.';
  const steps = kind === 'renewal' ? RENEWAL_STEPS : PROPERTY_STEPS;
  const reference = kind === 'renewal' && state.renewalId ? renewalReference({ renewal_id: state.renewalId }) : null;

  const primary = kind === 'renewal'
    ? { to: `/renewal-status-tracker${state.renewalId ? `?renewal=${state.renewalId}` : ''}`, label: 'Track renewal status' }
    : { to: '/my-listings', label: 'Go to My Listings' };
  const secondary = kind === 'renewal' ? { to: homePathForRole(user?.role), label: 'Back to dashboard' } : { to: '/list-your-property', label: 'List another property' };

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 md:p-12 w-full bg-surface">
      <div className="max-w-2xl w-full bg-surface-container-lowest rounded-xl p-8 md:p-12 shadow-[0px_10px_30px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-status-success/10 rounded-full flex items-center justify-center mb-8 border border-status-success/20">
          <Icon name="check_circle" className="text-[40px] text-status-success" />
        </div>
        <h1 className="font-headline-lg text-headline-lg text-primary mb-4 tracking-tight">{heading}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mb-8 leading-relaxed">{body}</p>

        {reference && (
          <div className="bg-surface-container-low border border-border-subtle rounded-lg p-6 w-full mb-10 text-left">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block mb-1">Reference number</span>
            <span className="font-headline-md text-headline-md text-primary font-bold">{reference}</span>
          </div>
        )}

        <div className="w-full text-left mb-12">
          <h2 className="font-label-md text-label-md text-primary mb-6 uppercase tracking-wider border-b border-border-subtle pb-2">What happens next</h2>
          <ul className="space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 mt-0.5">
                  <span className="font-label-sm text-label-sm text-primary">{i + 1}</span>
                </div>
                <div>
                  <span className="font-body-md text-body-md text-on-surface font-medium block">{step.title}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{step.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <button type="button" onClick={() => navigate(primary.to)} className="flex-1 bg-primary text-on-primary font-label-md text-label-md py-4 px-6 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            {primary.label}
            <Icon name="arrow_forward" className="text-[18px]" />
          </button>
          <Link to={secondary.to} className="flex-1 border border-border-subtle text-primary font-label-md text-label-md py-4 px-6 rounded-lg hover:bg-surface-container-low transition-colors flex items-center justify-center">
            {secondary.label}
          </Link>
        </div>
      </div>
    </main>
  );
}
