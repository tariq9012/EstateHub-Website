// src/components/agent/RenewalStepper.jsx
// Three-step indicator for the renewal flow (same visual language as the List Your Property stepper).

const STEPS = ['License details', 'Upload documents', 'Review & submit'];

export default function RenewalStepper({ step }) {
  return (
    <ol className="flex items-center justify-between relative max-w-2xl mx-auto mb-10" aria-label="Renewal progress">
      <div className="absolute left-0 top-4 w-full h-1 bg-border-subtle rounded-full -z-10" />
      <div className="absolute left-0 top-4 h-1 bg-primary rounded-full -z-10 transition-all" style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex flex-col items-center gap-2" aria-current={n === step ? 'step' : undefined}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center text-label-md font-label-md transition-colors ${n <= step ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest border border-border-subtle text-on-surface-variant'}`}>{n}</span>
            <span className={`text-label-sm font-label-sm text-center ${n <= step ? 'text-primary' : 'text-on-surface-variant'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
