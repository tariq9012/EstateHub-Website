// src/pages/ResubmissionSuccess.jsx — shown after resolving a "missing documents" renewal request.
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/agent/agentUi';
import { renewalReference } from '../components/agent/useRenewalData';

export default function ResubmissionSuccess() {
  const [params] = useSearchParams();
  const renewalId = Number(params.get('renewal')) || null;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 md:p-12 w-full bg-surface">
      <div className="max-w-xl w-full bg-surface-container-lowest rounded-xl p-8 md:p-12 border border-border-subtle flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-status-success/10 rounded-full flex items-center justify-center mb-8 border border-status-success/20">
          <Icon name="check_circle" className="text-[40px] text-status-success" />
        </div>
        <h1 className="font-headline-lg text-headline-lg text-primary mb-4 tracking-tight">Documents resubmitted</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-8">
          Thanks — your updated documents were sent back to the compliance team for review.
        </p>
        {renewalId && (
          <div className="bg-surface-container-low border border-border-subtle rounded-lg p-6 w-full mb-10 text-left">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block mb-1">Reference number</span>
            <span className="font-headline-md text-headline-md text-primary font-bold">{renewalReference({ renewal_id: renewalId })}</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <Link to={renewalId ? `/renewal-status-tracker?renewal=${renewalId}` : '/agent-certification-tracking'} className="flex-1 bg-primary text-on-primary font-label-md text-label-md py-4 px-6 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            Track status
            <Icon name="arrow_forward" className="text-[18px]" />
          </Link>
          <Link to="/agent-dashboard" className="flex-1 border border-border-subtle text-primary font-label-md text-label-md py-4 px-6 rounded-lg hover:bg-surface-container-low transition-colors flex items-center justify-center">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
