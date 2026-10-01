// src/pages/AgentVerificationReviewDetail.jsx
// This page and /agent-verification-review were both non-functional mockups of the same
// per-agent verification detail screen. Rather than maintain two near-duplicate real
// implementations, this route now redirects to the single working one, preserving ?agentId=
// so any existing links keep working.

import { Navigate, useSearchParams } from 'react-router-dom';

export default function AgentVerificationReviewDetail() {
  const [params] = useSearchParams();
  const agentId = params.get('agentId');
  return <Navigate to={`/agent-verification-review${agentId ? `?agentId=${agentId}` : ''}`} replace />;
}
