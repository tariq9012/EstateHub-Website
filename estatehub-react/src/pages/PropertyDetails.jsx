import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProperty, searchProperties, getPropertyReviews, createPropertyReview } from '../api/properties';
import { listFavorites, addFavorite, removeFavorite } from '../api/favorites';
import { createInquiry } from '../api/inquiries';
import { createAppointment } from '../api/appointments';
import { formatViewingDateTime } from '../components/appointments/appointmentUtils';
import { getAgent } from '../api/agents';
import PublicNavMenu from '../components/PublicNavMenu';

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString()}`;
}

const VIEWING_DURATIONS = [30, 45, 60, 90];

/** Today as YYYY-MM-DD in the visitor's local timezone (for <input type="date" min>). */
function todayLocalISO() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function RelatedCard({ property }) {
  return (
    <Link
      to={`/property-details/${property.property_id}`}
      className="group bg-surface-container-lowest rounded-xl overflow-hidden border border-border-subtle hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-300 block"
    >
      <div className="relative h-48 overflow-hidden bg-surface-container">
        {property.primary_image_url ? (
          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={property.primary_image_url} alt={property.title} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[36px]">home</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-headline-md font-headline-md text-primary mb-1">{formatPrice(property.price)}</p>
        <p className="text-body-sm font-body-sm text-on-surface-variant truncate">
          {[property.neighborhood, property.city].filter(Boolean).join(', ') || property.city}
        </p>
      </div>
    </Link>
  );
}

export default function PropertyDetails() {
  const { id } = useParams();
  const { user } = useAuth();

  const [property, setProperty] = useState(null);
  const [agent, setAgent] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);

  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const [visitorMessage, setVisitorMessage] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [viewingTime, setViewingTime] = useState('');
  const [viewingDuration, setViewingDuration] = useState(30);
  const [bookedViewing, setBookedViewing] = useState(null); // viewing already created by THIS submission (so a retry never books twice)
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [successInfo, setSuccessInfo] = useState(null); // { viewing, conversationId } for the follow-up links
  const submitLockRef = useRef(false); // synchronous double-submit guard (state updates are async)

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setActiveImage(0);
    Promise.all([getProperty(id), getPropertyReviews(id)])
      .then(([propData, reviewData]) => {
        setProperty(propData.property);
        setReviews(reviewData.reviews || []);
        if (propData.property.agent_id) {
          getAgent(propData.property.agent_id).then((a) => setAgent(a.agent)).catch(() => {});
        } else {
          setAgent(null);
        }
        return searchProperties({ typeId: propData.property.type_id, limit: 5 });
      })
      .then((relatedData) => {
        setRelated((relatedData.properties || []).filter((p) => String(p.property_id) !== String(id)).slice(0, 3));
      })
      .catch((err) => setError(err.message || 'Could not load this property.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user) {
      setIsFavorited(false);
      return;
    }
    listFavorites()
      .then((data) => setIsFavorited((data.favorites || []).some((f) => String(f.property_id) === String(id))))
      .catch(() => {});
  }, [id, user]);

  const toggleFavorite = async () => {
    if (!user) {
      window.location.href = '/sign-in';
      return;
    }
    setFavoriteBusy(true);
    try {
      if (isFavorited) {
        await removeFavorite(id);
        setIsFavorited(false);
      } else {
        await addFavorite(id);
        setIsFavorited(true);
      }
    } catch (err) {
      // keep prior state on failure
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return; // ignore a second click/Enter while the first request is running
    setFormError('');
    setFormSuccess('');
    setSuccessInfo(null);
    if (!user) {
      setFormError('Please sign in to contact the agent or schedule a viewing.');
      return;
    }

    // A viewing is only requested when the visitor explicitly picks BOTH a date and a time.
    const wantsViewing = Boolean(preferredDate);
    let scheduledAt = null;
    if (wantsViewing && !bookedViewing) {
      if (!viewingTime) {
        setFormError('Please choose a time for your viewing.');
        return;
      }
      const start = new Date(`${preferredDate}T${viewingTime}`);
      if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
        setFormError('Please choose a future date and time for your viewing.');
        return;
      }
      scheduledAt = start.toISOString(); // an unambiguous instant; the server stores UTC
    }

    submitLockRef.current = true;
    setFormSubmitting(true);
    try {
      // 1) Book the viewing FIRST: if the slot is taken (409) nothing else has been created yet.
      let viewing = bookedViewing;
      if (wantsViewing && !viewing) {
        const data = await createAppointment({
          propertyId: Number(id),
          scheduledAt,
          durationMinutes: Number(viewingDuration),
          notes: visitorMessage.trim().slice(0, 1000) || undefined,
        });
        viewing = data.appointment;
        setBookedViewing(viewing);
      }

      // 2) Send the message. If only this step fails, the viewing stays booked and a retry re-sends only the message.
      let conversationId = null;
      try {
        const inquiryMessage = visitorMessage.trim() || "I'm interested in this property.";
        const inquiry = await createInquiry({
          propertyId: Number(id),
          message: inquiryMessage,
          preferredVisitDate: preferredDate || undefined,
        });
        conversationId = inquiry?.conversationId || null;
      } catch (inquiryErr) {
        if (viewing) {
          setFormError(`Your viewing request was sent, but your message could not be delivered (${inquiryErr.message || 'unknown error'}). Press the button to try sending the message again.`);
          return;
        }
        throw inquiryErr;
      }

      setFormSuccess(
        viewing
          ? `Your viewing request for ${formatViewingDateTime(viewing.scheduled_at)} has been sent. The agent will confirm it soon.`
          : 'Your request has been sent. The agent will get back to you soon.'
      );
      setSuccessInfo({ viewing, conversationId });
      setVisitorMessage('');
      setPreferredDate('');
      setViewingTime('');
      setViewingDuration(30);
      setBookedViewing(null);
    } catch (err) {
      setFormError(err.message || 'Could not send your request. Please try again.');
    } finally {
      submitLockRef.current = false;
      setFormSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewError('');
    setReviewSubmitting(true);
    try {
      const data = await createPropertyReview(id, { rating: reviewRating, comment: reviewComment });
      setReviews(data.reviews || []);
      setReviewComment('');
    } catch (err) {
      setReviewError(err.message || 'Could not submit your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex-grow w-full py-24 text-center text-body-md font-body-md text-on-surface-variant">
        Loading property…
      </main>
    );
  }

  if (error || !property) {
    return (
      <main className="flex-grow w-full py-24 text-center text-body-md font-body-md text-on-surface-variant">
        {error || 'Property not found.'}
      </main>
    );
  }

  const images = property.images && property.images.length > 0 ? property.images : [];
  const canReview = user && property.listed_by_user_id !== user.user_id;
  const averageRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <>
      {/* TopNavBar */}
      <header className="bg-surface-container-lowest text-primary shadow-sm docked full-width top-0 z-50 border-b border-border-subtle">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-20">
          <div className="flex items-center gap-8">
            <Link className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary" to="/">
              EstateHub
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties?listingType=sale">
                Buy
              </Link>
              <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties?listingType=rent">
                Rent
              </Link>
              <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/list-your-property">
                Sell
              </Link>
              <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/find-an-agent">
                Agents
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link className="hidden md:inline-block text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/sign-in">
              Sign In
            </Link>
            <Link className="hidden md:inline-block bg-primary text-on-primary px-6 py-2 rounded-lg font-medium hover:bg-opacity-90 transition-colors" to="/list-your-property">
              List Your Property
            </Link>
            <PublicNavMenu />
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="flex-grow w-full">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8">
          {/* Hero Gallery */}
          <section className="mb-12 relative rounded-xl overflow-hidden shadow-sm bg-surface-container-lowest">
            <div className="relative h-[400px] md:h-[600px] w-full bg-surface-container">
              {images.length > 0 ? (
                <img className="w-full h-full object-cover" src={images[activeImage]?.image_url} alt={property.title} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[64px]">home</span>
                </div>
              )}
              <div className="absolute top-4 right-4 flex gap-2">
                <button aria-label="Favorite" onClick={toggleFavorite} disabled={favoriteBusy} className="bg-surface-container-lowest/90 backdrop-blur-sm text-primary p-2 rounded-full hover:bg-surface-container-lowest transition-colors shadow-sm disabled:opacity-60">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: isFavorited ? "'FILL' 1" : "'FILL' 0" }}>
                    {isFavorited ? 'favorite' : 'favorite_border'}
                  </span>
                </button>
              </div>
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {images.slice(0, 4).map((img, i) => (
                  <button
                    key={img.image_id}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`h-24 md:h-32 rounded-lg overflow-hidden transition-opacity ${i === activeImage ? 'opacity-100 ring-2 ring-primary' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <img className="w-full h-full object-cover" src={img.image_url} alt={`${property.title} ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Left Column */}
            <div className="lg:col-span-8 flex flex-col gap-12">
              <div className="border-b border-border-subtle pb-8">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
                  <div>
                    <h1 className="text-headline-xl font-headline-xl text-primary mb-2">
                      {property.title}
                    </h1>
                    <p className="text-body-lg font-body-lg text-on-surface-variant flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">location_on</span>
                      {[property.address_line, property.neighborhood, property.city, property.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-headline-lg font-headline-lg text-primary">
                      {formatPrice(property.price)}
                    </p>
                    <p className="text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">
                      For {property.listing_type === 'rent' ? 'Rent' : 'Sale'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-8 mt-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-surface-container-low p-3 rounded-full text-primary">
                      <span className="material-symbols-outlined">bed</span>
                    </div>
                    <div>
                      <p className="text-headline-md font-headline-md">{property.bedrooms ?? '—'}</p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">Bedrooms</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-surface-container-low p-3 rounded-full text-primary">
                      <span className="material-symbols-outlined">bathtub</span>
                    </div>
                    <div>
                      <p className="text-headline-md font-headline-md">{property.bathrooms ?? '—'}</p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">Bathrooms</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-surface-container-low p-3 rounded-full text-primary">
                      <span className="material-symbols-outlined">square_foot</span>
                    </div>
                    <div>
                      <p className="text-headline-md font-headline-md">
                        {property.area_sqft ? Number(property.area_sqft).toLocaleString() : '—'}
                      </p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">Sq Ft</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overview */}
              <section>
                <h2 className="text-headline-md font-headline-md text-primary mb-4">Property Overview</h2>
                <div className="text-body-md font-body-md text-on-surface-variant space-y-4 whitespace-pre-line">
                  {property.description || 'No description provided for this property yet.'}
                </div>
              </section>

              {/* Amenities */}
              {property.amenities && property.amenities.length > 0 && (
                <section>
                  <h2 className="text-headline-md font-headline-md text-primary mb-6">Key Features &amp; Amenities</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    {property.amenities.map((amenity) => (
                      <div key={amenity.amenity_id} className="flex items-center gap-4 bg-surface-container-lowest p-4 rounded-lg border border-border-subtle shadow-[0px_10px_30px_rgba(15,23,42,0.02)]">
                        <span className="material-symbols-outlined text-primary text-2xl">{amenity.icon || 'check_circle'}</span>
                        <span className="text-body-md font-body-md font-medium text-primary">{amenity.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Location — a real map (OpenStreetMap, no API key needed) when the listing has
                  coordinates; otherwise a plain address block with a link out to Google Maps.
                  Never shows a fake/placeholder map. */}
              <section>
                <h2 className="text-headline-md font-headline-md text-primary mb-4">Location</h2>
                {property.latitude != null && property.longitude != null ? (
                  <div className="rounded-xl overflow-hidden h-80 border border-border-subtle">
                    <iframe
                      title="Property location map"
                      className="w-full h-full border-0"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(property.longitude) - 0.01}%2C${Number(property.latitude) - 0.01}%2C${Number(property.longitude) + 0.01}%2C${Number(property.latitude) + 0.01}&layer=mapnik&marker=${property.latitude}%2C${property.longitude}`}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden min-h-[160px] relative border border-border-subtle">
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-2 bg-surface-container-low h-full">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant">location_on</span>
                      <p className="text-body-md font-body-md text-on-surface-variant">
                        {[property.neighborhood, property.city, property.country].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">
                        No map coordinates were provided for this listing.
                      </p>
                      <a
                        className="text-label-md font-label-md text-primary hover:underline"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          [property.address_line, property.neighborhood, property.city, property.country].filter(Boolean).join(', ')
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Search this address on Google Maps ↗
                      </a>
                    </div>
                  </div>
                )}
              </section>

              {/* Reviews */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-headline-md font-headline-md text-primary">
                    Reviews {averageRating && `· ${averageRating} (${reviews.length})`}
                  </h2>
                </div>
                <div className="space-y-4">
                  {reviews.length === 0 ? (
                    <p className="text-body-md font-body-md text-on-surface-variant">No reviews yet for this property.</p>
                  ) : (
                    reviews.map((review) => (
                      <div key={review.review_id} className="bg-surface-container-lowest p-5 rounded-xl border border-border-subtle">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-label-md font-label-md text-primary">
                            {review.first_name} {review.last_name}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <span key={n} className="material-symbols-outlined text-[16px] text-amber-500" style={{ fontVariationSettings: n <= review.rating ? "'FILL' 1" : "'FILL' 0" }}>
                                star
                              </span>
                            ))}
                          </div>
                        </div>
                        {review.comment && (
                          <p className="text-body-md font-body-md text-on-surface-variant">{review.comment}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {canReview && (
                  <form className="mt-6 bg-surface-container-lowest p-6 rounded-xl border border-border-subtle flex flex-col gap-4" onSubmit={handleReviewSubmit}>
                    <h3 className="text-body-lg font-body-lg font-semibold text-primary">Leave a review</h3>
                    {reviewError && <p className="text-body-sm font-body-sm text-error">{reviewError}</p>}
                    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={n === reviewRating} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setReviewRating(n)} className="p-0.5">
                          <span className="material-symbols-outlined text-[24px] text-amber-500" aria-hidden="true" style={{ fontVariationSettings: n <= reviewRating ? "'FILL' 1" : "'FILL' 0" }}>
                            star
                          </span>
                        </button>
                      ))}
                    </div>
                    <textarea
                      aria-label="Your review"
                      className="w-full border border-border-subtle rounded-lg p-3 text-body-sm font-body-sm bg-surface text-on-surface focus:ring-1 focus:ring-primary focus:border-primary"
                      rows="3"
                      placeholder="Share your experience with this property…"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                    />
                    <button type="submit" disabled={reviewSubmitting} className="self-start bg-primary text-on-primary px-6 py-2.5 rounded-lg text-label-md font-label-md hover:bg-opacity-90 transition-colors disabled:opacity-60">
                      {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </form>
                )}
              </section>
            </div>

            {/* Right Column (Sidebar) */}
            <div className="lg:col-span-4">
              <div className="sticky top-28 flex flex-col gap-6">
                {/* Agent / Lister Card */}
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-[0px_10px_30px_rgba(15,23,42,0.05)]">
                  <h3 className="text-headline-md font-headline-md text-primary mb-6">Listed By</h3>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center text-primary font-headline-md font-headline-md flex-shrink-0">
                      {agent?.avatar_url ? (
                        <img className="w-full h-full object-cover" src={agent.avatar_url} alt={agent.first_name} />
                      ) : (
                        <span>{(agent?.first_name || property.lister_first_name || '?')[0]}</span>
                      )}
                    </div>
                    <div>
                      {agent ? (
                        <Link to={`/agent-profile/${agent.agent_id}`} className="text-body-lg font-body-lg font-semibold text-primary hover:underline">
                          {agent.first_name} {agent.last_name}
                        </Link>
                      ) : (
                        <p className="text-body-lg font-body-lg font-semibold text-primary">
                          {property.lister_first_name} {property.lister_last_name}
                        </p>
                      )}
                      {agent ? (
                        <p className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined text-sm text-amber-500">star</span>
                          {Number(agent.average_rating || 0).toFixed(1)} ({agent.total_reviews || 0} reviews)
                        </p>
                      ) : (
                        <p className="text-label-sm font-label-sm text-on-surface-variant mt-1">Property Owner</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact / Schedule Viewing Form */}
                <div className="bg-surface-container-lowest p-6 rounded-xl border border-border-subtle shadow-[0px_10px_30px_rgba(15,23,42,0.05)]">
                  <h3 className="text-headline-md font-headline-md text-primary mb-2">Contact &amp; Schedule a Viewing</h3>
                  <p className="text-body-sm font-body-sm text-on-surface-variant mb-6">
                    Send a message and, optionally, request a viewing at a specific date and time.
                  </p>
                  {!user ? (
                    <div className="text-center py-4">
                      <p className="text-body-md font-body-md text-on-surface-variant mb-3">Sign in to contact the agent.</p>
                      <Link className="text-primary text-label-md font-label-md hover:underline" to="/sign-in">Sign In</Link>
                    </div>
                  ) : (
                    <form className="space-y-4" onSubmit={handleFormSubmit}>
                      {formError && (
                        <p className="text-body-sm font-body-sm text-error" role="alert">
                          {formError}
                        </p>
                      )}
                      {formSuccess && (
                        <div className="rounded-lg bg-status-success/10 p-4 space-y-3" role="status">
                          <p className="text-body-sm font-body-sm text-status-success">{formSuccess}</p>
                          <div className="flex flex-wrap gap-2">
                            {successInfo?.viewing && (
                              <Link to="/appointments" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-primary text-on-primary text-label-md font-label-md hover:opacity-90 transition-opacity">
                                View My Appointments
                              </Link>
                            )}
                            {successInfo?.conversationId && (
                              <Link to={`/messages?conversation=${successInfo.conversationId}`} className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg border border-border-subtle text-primary text-label-md font-label-md hover:bg-surface-container-low transition-colors">
                                Open Conversation
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                      <fieldset className="space-y-3 rounded-lg border border-border-subtle p-4" disabled={Boolean(bookedViewing)}>
                        <legend className="px-1 text-label-sm font-label-sm text-primary">Request a viewing (optional)</legend>
                        <div>
                          <label className="block text-label-sm font-label-sm text-primary mb-1" htmlFor="viewing-date">Preferred Date</label>
                          <input
                            id="viewing-date"
                            className="w-full rounded-lg border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-md font-body-md text-on-surface-variant"
                            type="date"
                            min={todayLocalISO()}
                            value={preferredDate}
                            onChange={(e) => {
                              setPreferredDate(e.target.value);
                              if (!e.target.value) setViewingTime('');
                            }}
                          />
                        </div>
                        {preferredDate && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-label-sm font-label-sm text-primary mb-1" htmlFor="viewing-time">Time</label>
                              <input
                                id="viewing-time"
                                className="w-full rounded-lg border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-md font-body-md text-on-surface-variant"
                                type="time"
                                step="900"
                                required
                                value={viewingTime}
                                onChange={(e) => setViewingTime(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-label-sm font-label-sm text-primary mb-1" htmlFor="viewing-duration">Duration</label>
                              <select
                                id="viewing-duration"
                                className="w-full rounded-lg border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-md font-body-md text-on-surface-variant"
                                value={viewingDuration}
                                onChange={(e) => setViewingDuration(e.target.value)}
                              >
                                {VIEWING_DURATIONS.map((m) => (
                                  <option key={m} value={m}>{m} minutes</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                        <p className="text-label-sm font-label-sm text-on-surface-variant">
                          {bookedViewing
                            ? 'Your viewing request is already sent. Only your message still needs to be delivered.'
                            : 'Times are in your local timezone. The agent must confirm your request.'}
                        </p>
                      </fieldset>
                      <div>
                        <label className="block text-label-sm font-label-sm text-primary mb-1" htmlFor="viewing-message">Message</label>
                        <textarea
                          id="viewing-message"
                          className="w-full rounded-lg border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-md font-body-md placeholder:text-on-surface-variant/50"
                          placeholder="I'm interested in…"
                          rows="3"
                          value={visitorMessage}
                          onChange={(e) => setVisitorMessage(e.target.value)}
                        />
                      </div>
                      <button
                        className="w-full bg-primary text-on-primary py-3 rounded-lg font-label-md text-label-md hover:bg-opacity-90 transition-colors mt-2 disabled:opacity-60"
                        type="submit"
                        disabled={formSubmitting}
                      >
                        {formSubmitting ? 'Sending…' : bookedViewing ? 'Retry Sending Message' : preferredDate ? 'Send & Request Viewing' : 'Send Message'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Related Properties */}
          {related.length > 0 && (
            <section className="mt-16">
              <h2 className="text-headline-md font-headline-md text-primary mb-6">Similar Properties</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {related.map((p) => (
                  <RelatedCard key={p.property_id} property={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      {/* Footer */}
      <footer className="bg-surface-container-high text-primary border-t border-border-subtle">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Link className="text-headline-md font-headline-md font-bold text-primary" to="/">
              EstateHub
            </Link>
            <div className="flex gap-6">
              <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors" to="/browse-properties?listingType=sale">
                Buy
              </Link>
              <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors" to="/browse-properties?listingType=rent">
                Rent
              </Link>
              <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors" to="/list-your-property">
                Sell
              </Link>
              <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors" to="/">
                About
              </Link>
              <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors" to="/">
                Contact
              </Link>
            </div>
          </div>
          <p className="text-label-sm font-label-sm text-on-surface-variant text-center mt-8">
            © 2024 EstateHub. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}