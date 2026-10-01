// src/pages/AgentReviews.jsx
// The signed-in agent's reviews, read-only (GET /agents/:id — the agent id comes from the signed-in
// user). Agents cannot edit, delete or reply to buyer reviews: no such backend rule exists, so no
// such control is shown.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AgentLayout from '../components/agent/AgentLayout';
import useAsyncData from '../hooks/useAsyncData';
import { getAgent } from '../api/agents';
import { Card, DataState, Icon, btnOutline } from '../components/agent/agentUi';
import { formatTimestamp, fullName } from '../components/agent/agentUtils';

function Stars({ value, size = 'text-[20px]' }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" className={`${size} ${n <= Math.round(value) ? 'text-primary' : 'text-outline-variant'}`} />
      ))}
    </span>
  );
}

const PAGE_SIZE = 10;

export default function AgentReviews() {
  const { user } = useAuth();
  const agentId = user?.agentProfile?.agent_id;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState(0); // 0 = all, otherwise a star rating

  const profile = useAsyncData(() => (agentId ? getAgent(agentId) : Promise.resolve(null)), [agentId]);
  const agent = profile.data?.agent;
  const reviews = profile.data?.reviews || [];

  const distribution = useMemo(() => {
    const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => { d[r.rating] = (d[r.rating] || 0) + 1; });
    return d;
  }, [reviews]);

  const shown = useMemo(() => reviews.filter((r) => filter === 0 || r.rating === filter), [reviews, filter]);
  const total = Number(agent?.total_reviews) || reviews.length;

  return (
    <AgentLayout active="reviews" title="Reviews" subtitle="What buyers say about working with you." actions={<Link to="/agent-profile" className={btnOutline}>View public profile</Link>}>
      <DataState
        loading={profile.loading}
        error={profile.error || (!agentId && !profile.loading ? 'Your agent profile could not be found.' : '')}
        onRetry={() => profile.reload()}
        empty={reviews.length === 0}
        emptyProps={{ icon: 'star', title: 'No reviews yet', children: 'Reviews from buyers will appear here. You can’t review yourself, and reviews can’t be edited by agents.' }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-1 self-start" data-widget="rating-summary">
            <p className="text-label-md font-label-md text-on-surface-variant mb-2">Average rating</p>
            <p className="text-[56px] leading-none font-headline-lg text-primary">{Number(agent?.average_rating || 0).toFixed(1)}</p>
            <div className="mt-2"><Stars value={Number(agent?.average_rating || 0)} size="text-[24px]" /></div>
            <p className="mt-2 text-body-sm font-body-sm text-on-surface-variant">{total} review{total === 1 ? '' : 's'}</p>
            <div className="mt-5 space-y-2" aria-label="Rating breakdown">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star] || 0;
                const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <button key={star} type="button" onClick={() => { setFilter(filter === star ? 0 : star); setVisibleCount(PAGE_SIZE); }} aria-pressed={filter === star}
                    className={`w-full flex items-center gap-3 min-h-[32px] rounded-md px-1 ${filter === star ? 'bg-surface-container-low' : 'hover:bg-surface-container-low'}`}>
                    <span className="w-10 text-label-sm font-label-sm text-on-surface-variant text-left">{star} ★</span>
                    <span className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${pct}%` }} /></span>
                    <span className="w-6 text-right text-label-sm font-label-sm text-on-surface-variant">{count}</span>
                  </button>
                );
              })}
            </div>
            {filter !== 0 && <button type="button" className="mt-3 text-label-md font-label-md text-primary hover:underline" onClick={() => setFilter(0)}>Show all reviews</button>}
          </Card>

          <div className="lg:col-span-2">
            {shown.length === 0 ? (
              <Card className="p-8 text-center text-body-sm font-body-sm text-on-surface-variant">No {filter}-star reviews.</Card>
            ) : (
              <ul className="space-y-4" aria-label="Reviews">
                {shown.slice(0, visibleCount).map((r) => (
                  <li key={r.review_id}>
                    <Card className="p-5" data-review-id={r.review_id}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-surface-container-high text-primary flex items-center justify-center text-label-md font-label-md border border-border-subtle flex-shrink-0" aria-hidden="true">
                            {(fullName(r.first_name, r.last_name, 'A')[0] || 'A').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-label-md font-label-md text-primary truncate">{fullName(r.first_name, r.last_name, 'Anonymous')}</p>
                            <p className="text-label-sm font-label-sm text-on-surface-variant">{formatTimestamp(r.created_at)}</p>
                          </div>
                        </div>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment ? <p className="text-body-md font-body-md text-on-surface whitespace-pre-wrap break-words">{r.comment}</p> : <p className="text-body-sm font-body-sm text-on-surface-variant italic">No written comment.</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {shown.length > visibleCount && (
              <div className="mt-4 text-center">
                <button type="button" className={btnOutline} onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>Show more reviews</button>
              </div>
            )}
          </div>
        </div>
      </DataState>
    </AgentLayout>
  );
}
