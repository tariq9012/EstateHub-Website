import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAgent, createAgentReview } from '../api/agents';
import { searchProperties } from '../api/properties';
import PublicNavMenu from '../components/PublicNavMenu';

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString()}`;
}

function PropertyCard({ property }) {
  return (
    <Link
      to={`/property-details/${property.property_id}`}
      className="group bg-surface-container-lowest rounded-2xl overflow-hidden border border-border-subtle shadow-[0_10px_30px_rgba(15,23,42,0.02)] hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-all duration-300 block"
    >
      <div className="relative h-64 overflow-hidden bg-surface-container">
        {property.primary_image_url ? (
          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={property.primary_image_url} alt={property.title} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px]">home</span>
          </div>
        )}
        <div className="absolute top-4 left-4 bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1 rounded-full text-label-sm font-label-sm text-primary capitalize">
          {property.listing_type === 'rent' ? 'For Rent' : 'For Sale'}
        </div>
        <button className="absolute top-4 right-4 w-10 h-10 bg-surface-container-lowest/90 backdrop-blur-sm rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" type="button" onClick={(e) => e.preventDefault()}>
          <span className="material-symbols-outlined">
            favorite
          </span>
        </button>
      </div>
      <div className="p-6">
        <div className="text-headline-md font-headline-md text-primary mb-2">
          {formatPrice(property.price)}
        </div>
        <div className="text-body-md font-body-md text-on-surface-variant mb-4 truncate">
          {[property.neighborhood, property.city].filter(Boolean).join(', ') || property.city}
        </div>
        <div className="flex items-center gap-4 border-t border-border-subtle pt-4">
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">bed</span>
            <span className="text-label-sm font-label-sm">{property.bedrooms ?? '—'} Beds</span>
          </div>
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">shower</span>
            <span className="text-label-sm font-label-sm">{property.bathrooms ?? '—'} Baths</span>
          </div>
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">square_foot</span>
            <span className="text-label-sm font-label-sm">
              {property.area_sqft ? `${Number(property.area_sqft).toLocaleString()} SqFt` : '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function AgentProfile() {
  const { id: idParam } = useParams();
  const { user } = useAuth();
  const resolvedId = idParam || user?.agentProfile?.agent_id;

  const [activeTab, setActiveTab] = useState('about');
  const [agent, setAgent] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    if (!resolvedId) {
      setLoading(false);
      setError('No agent selected.');
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([
      getAgent(resolvedId),
      searchProperties({ agentId: resolvedId, limit: 12, sortBy: 'newest' }),
    ])
      .then(([agentData, propertyData]) => {
        setAgent(agentData.agent);
        setReviews(agentData.reviews || []);
        setListings(propertyData.properties || []);
      })
      .catch((err) => setError(err.message || 'Could not load this agent profile.'))
      .finally(() => setLoading(false));
  }, [resolvedId]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewError('');
    setReviewSubmitting(true);
    try {
      const data = await createAgentReview(resolvedId, { rating: reviewRating, comment: reviewComment });
      setReviews(data.reviews || []);
      setReviewComment('');
    } catch (err) {
      setReviewError(err.message || 'Could not submit your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const canLeaveReview = user && agent && user.user_id !== agent.user_id;

  if (loading) {
    return (
      <main className="flex-grow w-full py-24 text-center text-body-md font-body-md text-on-surface-variant">
        Loading agent profile…
      </main>
    );
  }

  if (error || !agent) {
    return (
      <main className="flex-grow w-full py-24 text-center text-body-md font-body-md text-on-surface-variant">
        {error || 'Agent not found.'}
      </main>
    );
  }

  return (
    <>
{/* TopNavBar (Web) */}
<header className="bg-surface-container-lowest flex sticky docked full-width top-0 z-50 border-b border-border-subtle shadow-sm transition-all duration-300">
  <div className="flex justify-between items-center w-full px-margin-desktop max-w-container-max mx-auto h-20">
    <Link className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary flex items-center gap-2" to="/">
      EstateHub
    </Link>
    <nav className="hidden md:flex items-center gap-8">
      <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties?listingType=sale">
        Buy
      </Link>
      <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties?listingType=rent">
        Rent
      </Link>
      <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/list-your-property">
        Sell
      </Link>
      <Link className="text-primary font-bold border-b-2 border-primary pb-1 opacity-80 scale-95 transition-all" to="/find-an-agent">
        Agents
      </Link>
      <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties">
        Explore
      </Link>
    </nav>
    <div className="flex items-center gap-4">
      <Link className="hidden md:inline-block text-body-md font-body-md text-on-surface-variant hover:text-primary transition-colors duration-200" to="/sign-in">
        Sign In
      </Link>
      <Link className="hidden md:inline-block bg-primary text-on-primary px-6 py-2 rounded-lg text-label-md font-label-md hover:bg-inverse-surface transition-colors duration-200 shadow-[0_4px_14px_0_rgba(0,0,0,0.1)]" to="/list-your-property">
        List Your Property
      </Link>
      <PublicNavMenu />
    </div>
  </div>
</header>
{/* Main Content */}
<main className="flex-grow w-full">
  {/* Agent Header Hero */}
  <section className="relative w-full">
    <div className="w-full h-[409px] md:h-[512px] bg-cover bg-center bg-surface-container-high" style={{backgroundImage: "linear-gradient(135deg, #1f2d3d 0%, #37536b 45%, #6f8ba0 100%)"}}>
      <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent">
      </div>
    </div>
    {/* Profile Info Container */}
    <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop relative -mt-24 md:-mt-32 z-10 pb-16">
      <div className="flex flex-col md:flex-row items-end md:items-end gap-6 md:gap-10">
        {/* Avatar */}
        <div className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-surface-container-lowest bg-surface-container-high overflow-hidden flex-shrink-0 shadow-lg flex items-center justify-center">
          {agent.avatar_url ? (
            <img className="w-full h-full object-cover" src={agent.avatar_url} alt={`${agent.first_name} ${agent.last_name}`} />
          ) : (
            <span className="text-headline-xl font-headline-xl text-primary">
              {agent.first_name?.[0]}
              {agent.last_name?.[0]}
            </span>
          )}
        </div>
        {/* Details & Actions */}
        <div className="flex-grow flex flex-col md:flex-row justify-between items-start md:items-end w-full gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-headline-xl font-headline-xl text-primary mt-4 md:mt-0">
                {agent.first_name} {agent.last_name}
              </h1>
              {agent.verification_status === 'verified' && (
                <span className="bg-status-success/10 text-status-success text-label-sm font-label-sm px-2 py-1 rounded-full flex items-center gap-1 border border-status-success/20">
                  <span className="material-symbols-outlined text-[14px]">
                    verified
                  </span>
                  Verified
                </span>
              )}
            </div>
            <p className="text-body-lg font-body-lg text-on-surface-variant flex items-center gap-2">
              {agent.specialty || 'Real Estate Agent'}
              {agent.agency_name && (
                <>
                  <span className="text-border-subtle">|</span>
                  {agent.agency_name}
                </>
              )}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center text-primary">
                <span className="material-symbols-outlined text-[18px] text-[#F59E0B]" style={{fontVariationSettings: "'FILL' 1"}}>
                  star
                </span>
                <span className="text-label-md font-label-md ml-1">
                  {Number(agent.average_rating || 0).toFixed(1)}
                </span>
                <span className="text-body-sm font-body-sm text-on-surface-variant ml-1">
                  ({agent.total_reviews || 0} Reviews)
                </span>
              </div>
              {agent.years_experience != null && (
                <div className="flex items-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[18px]">
                    workspace_premium
                  </span>
                  <span className="text-body-sm font-body-sm ml-1">
                    {agent.years_experience} yrs experience
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* CTA Buttons */}
          <div className="flex gap-3 w-full md:w-auto">
            <a
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-surface-container-lowest border border-border-subtle text-primary px-6 py-3 rounded-lg text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200"
              href={`mailto:${agent.email}`}
            >
              <span className="material-symbols-outlined">
                mail
              </span>
              Email
            </a>
            {agent.phone ? (
              <a
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-lg text-label-md font-label-md hover:bg-inverse-surface transition-colors duration-200 shadow-md hover:shadow-lg"
                href={`tel:${agent.phone}`}
              >
                <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>
                  call
                </span>
                Call Now
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  </section>
  {/* Content Tabs Area */}
  <section className="w-full bg-surface-container-lowest border-b border-border-subtle sticky top-0 md:top-20 z-40">
    <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
      <nav className="flex gap-8 overflow-x-auto hide-scrollbar">
        <button
          className={`py-4 text-label-md font-label-md whitespace-nowrap border-b-2 transition-colors ${activeTab === 'about' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
          onClick={() => setActiveTab('about')}
          type="button"
        >
          About
        </button>
        <button
          className={`py-4 text-label-md font-label-md whitespace-nowrap border-b-2 transition-colors ${activeTab === 'listings' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
          onClick={() => setActiveTab('listings')}
          type="button"
        >
          Active Listings ({listings.length})
        </button>
        <button
          className={`py-4 text-label-md font-label-md whitespace-nowrap border-b-2 transition-colors ${activeTab === 'sold' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
          onClick={() => setActiveTab('sold')}
          type="button"
        >
          Sold Properties
        </button>
        <button
          className={`py-4 text-label-md font-label-md whitespace-nowrap border-b-2 transition-colors ${activeTab === 'reviews' ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'}`}
          onClick={() => setActiveTab('reviews')}
          type="button"
        >
          Client Reviews ({reviews.length})
        </button>
      </nav>
    </div>
  </section>

  {/* About Tab */}
  {activeTab === 'about' && (
  <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-gutter">
    {/* Left Column (About & Details) */}
    <div className="lg:col-span-4 flex flex-col gap-10">
      {/* About Section */}
      <div>
        <h2 className="text-headline-md font-headline-md text-primary mb-4">
          About {agent.first_name}
        </h2>
        <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed whitespace-pre-line">
          {agent.bio || 'This agent has not added a bio yet.'}
        </p>
      </div>
      {/* Details */}
      <div className="bg-surface p-6 rounded-xl border border-border-subtle">
        <h3 className="text-body-lg font-body-lg font-semibold text-primary mb-4">
          Agent Details
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-body-md font-body-md text-on-surface-variant">
              License #
            </span>
            <span className="text-label-md font-label-md text-primary">
              {agent.license_number}
            </span>
          </div>
          {agent.years_experience != null && (
            <div className="flex justify-between items-center">
              <span className="text-body-md font-body-md text-on-surface-variant">
                Experience
              </span>
              <span className="text-label-md font-label-md text-primary">
                {agent.years_experience} years
              </span>
            </div>
          )}
          {agent.office_address && (
            <div className="flex justify-between items-center">
              <span className="text-body-md font-body-md text-on-surface-variant">
                Office
              </span>
              <span className="text-label-md font-label-md text-primary text-right">
                {agent.office_address}
              </span>
            </div>
          )}
          {agent.company_website && (
            <div className="flex justify-between items-center">
              <span className="text-body-md font-body-md text-on-surface-variant">
                Website
              </span>
              <a className="text-label-md font-label-md text-primary hover:underline truncate" href={agent.company_website} target="_blank" rel="noreferrer">
                {agent.company_website}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
    {/* Right Column (Listings preview) */}
    <div className="lg:col-span-8 flex flex-col gap-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-md font-headline-md text-primary">
            Active Listings
          </h2>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Properties currently managed by {agent.first_name}.
          </p>
        </div>
        {listings.length > 2 && (
          <button className="text-primary text-label-md font-label-md hover:underline hidden md:block" onClick={() => setActiveTab('listings')} type="button">
            View all listings
          </button>
        )}
      </div>
      {listings.length === 0 ? (
        <p className="text-body-md font-body-md text-on-surface-variant">No active listings right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {listings.slice(0, 2).map((property) => (
            <PropertyCard key={property.property_id} property={property} />
          ))}
        </div>
      )}
    </div>
  </div>
  )}

  {/* Active Listings Tab */}
  {activeTab === 'listings' && (
  <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 md:py-16">
    <h2 className="text-headline-md font-headline-md text-primary mb-8">
      All Active Listings
    </h2>
    {listings.length === 0 ? (
      <p className="text-body-md font-body-md text-on-surface-variant">No active listings right now.</p>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {listings.map((property) => (
          <PropertyCard key={property.property_id} property={property} />
        ))}
      </div>
    )}
  </div>
  )}

  {/* Sold Properties Tab */}
  {activeTab === 'sold' && (
  <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-20 text-center">
    <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 block">
      sell
    </span>
    <p className="text-body-lg font-body-lg text-on-surface-variant">
      No sold properties to display yet.
    </p>
  </div>
  )}

  {/* Client Reviews Tab */}
  {activeTab === 'reviews' && (
  <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-gutter">
    <div className="lg:col-span-7 flex flex-col gap-6">
      <h2 className="text-headline-md font-headline-md text-primary">
        Client Reviews
      </h2>
      {reviews.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 block">
            rate_review
          </span>
          <p className="text-body-lg font-body-lg text-on-surface-variant">
            No client reviews yet.
          </p>
        </div>
      ) : (
        reviews.map((review) => (
          <div key={review.review_id} className="bg-surface p-6 rounded-xl border border-border-subtle">
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-md font-label-md text-primary">
                {review.first_name} {review.last_name}
              </span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className="material-symbols-outlined text-[16px] text-[#F59E0B]"
                    style={{ fontVariationSettings: n <= review.rating ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                ))}
              </div>
            </div>
            {review.comment && (
              <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed">
                {review.comment}
              </p>
            )}
          </div>
        ))
      )}
    </div>

    {/* Leave a review */}
    <div className="lg:col-span-5">
      {canLeaveReview ? (
        <form className="bg-surface p-6 rounded-xl border border-border-subtle flex flex-col gap-4" onSubmit={handleReviewSubmit}>
          <h3 className="text-body-lg font-body-lg font-semibold text-primary">
            Leave a review
          </h3>
          {reviewError && (
            <p className="text-body-sm font-body-sm text-error">{reviewError}</p>
          )}
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === reviewRating}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={() => setReviewRating(n)}
                className="p-0.5"
              >
                <span
                  className="material-symbols-outlined text-[24px] text-[#F59E0B]"
                  aria-hidden="true"
                  style={{ fontVariationSettings: n <= reviewRating ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
              </button>
            ))}
          </div>
          <textarea
            aria-label="Your review"
            className="w-full border border-border-subtle rounded-lg p-3 text-body-sm font-body-sm bg-surface-container-lowest text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
            rows="4"
            placeholder="Share your experience working with this agent…"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />
          <button
            type="submit"
            disabled={reviewSubmitting}
            className="bg-primary text-on-primary px-6 py-3 rounded-lg text-label-md font-label-md hover:bg-inverse-surface transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
          </button>
        </form>
      ) : !user ? (
        <div className="bg-surface p-6 rounded-xl border border-border-subtle text-center">
          <p className="text-body-md font-body-md text-on-surface-variant mb-3">
            Sign in to leave a review for this agent.
          </p>
          <Link className="text-primary text-label-md font-label-md hover:underline" to="/sign-in">
            Sign In
          </Link>
        </div>
      ) : null}
    </div>
  </div>
  )}
</main>
{/* Footer */}
<footer className="bg-surface-container-high border-t border-border-subtle w-full mt-auto">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter px-margin-desktop py-16 max-w-container-max mx-auto">
    <div className="flex flex-col gap-4">
      <span className="text-headline-md font-headline-md font-bold text-primary">
        EstateHub
      </span>
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        © 2024 EstateHub. All rights reserved.
      </p>
    </div>
    <div className="flex flex-col gap-3">
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/browse-properties?listingType=sale">
        Buy
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/browse-properties?listingType=rent">
        Rent
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/list-your-property">
        Sell
      </Link>
    </div>
    <div className="flex flex-col gap-3">
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/">
        Resources
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/">
        About
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary outline-none" to="/">
        Contact
      </Link>
    </div>
  </div>
</footer>
    </>
  );
}