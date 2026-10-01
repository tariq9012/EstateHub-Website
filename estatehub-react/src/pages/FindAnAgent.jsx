import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAgents } from '../api/agents';
import { getLocations } from '../api/lookups';
import PublicNavMenu from '../components/PublicNavMenu';

export default function FindAnAgent() {
  const [keyword, setKeyword] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [cityOptions, setCityOptions] = useState([]);

  const [agents, setAgents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [keyword, specialty, city]);

  useEffect(() => {
    getLocations()
      .then((data) => {
        const distinctCities = Array.from(new Set((data.locations || []).map((l) => l.city).filter(Boolean))).sort();
        setCityOptions(distinctCities);
      })
      .catch(() => setCityOptions([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    listAgents({ keyword, specialty, city, page, limit: 9 })
      .then((data) => {
        setAgents(data.agents || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      })
      .catch((err) => setError(err.message || 'Could not load agents.'))
      .finally(() => setLoading(false));
  }, [keyword, specialty, city, page]);
  return (
    <>
{/* TopNavBar */}
<nav className="flex bg-surface-container-lowest text-primary shadow-sm border-b border-border-subtle sticky top-0 z-50">
  <div className="flex justify-between items-center w-full px-margin-desktop max-w-container-max mx-auto h-20">
    <Link className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary" to="/">
      EstateHub
    </Link>
    <div className="flex items-center gap-8">
      <ul className="hidden md:flex items-center gap-6">
        <li>
          <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 text-label-md font-label-md" to="/browse-properties?listingType=sale">
            Buy
          </Link>
        </li>
        <li>
          <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 text-label-md font-label-md" to="/browse-properties?listingType=rent">
            Rent
          </Link>
        </li>
        <li>
          <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 text-label-md font-label-md" to="/list-your-property">
            Sell
          </Link>
        </li>
        <li>
          <Link className="text-primary font-bold border-b-2 border-primary pb-1 hover:text-primary transition-colors duration-200 text-label-md font-label-md opacity-80 scale-95 transition-all" to="/find-an-agent">
            Agents
          </Link>
        </li>
        <li>
          <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 text-label-md font-label-md" to="/browse-properties">
            Explore
          </Link>
        </li>
      </ul>
    </div>
    <div className="flex items-center gap-4">
      <Link className="hidden md:inline-block text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors" to="/sign-in">
        Sign In
      </Link>
      <Link className="hidden md:inline-block bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity" to="/list-your-property">
        List Your Property
      </Link>
      <PublicNavMenu />
    </div>
  </div>
</nav>
{/* Main Content Canvas */}
<main className="flex-grow px-margin-mobile md:px-margin-desktop py-12 md:py-20 max-w-container-max mx-auto w-full">
  {/* Header & Search */}
  <header className="mb-12 md:mb-16">
    <h1 className="text-headline-xl font-headline-xl text-on-background mb-4 md:mb-6">
      Find Your Agent
    </h1>
    <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl mb-8">
      Connect with top-rated professionals to guide you through your real estate journey.
    </p>
    <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_10px_30px_rgba(15,23,42,0.05)] border border-border-subtle flex flex-col md:flex-row gap-4 items-center">
      <div className="relative flex-grow w-full">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
          search
        </span>
        <input aria-label="Search agents by name or company" className="w-full pl-12 pr-4 py-3 bg-surface-bright border border-border-subtle rounded-lg text-body-md font-body-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors" placeholder="Search by name or company..." type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>
      <div className="flex gap-4 w-full md:w-auto">
        <div className="relative flex-grow md:w-48">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            location_on
          </span>
          <select
            aria-label="Filter by location"
            className="w-full pl-12 pr-10 py-3 bg-surface-bright border border-border-subtle rounded-lg text-body-md font-body-md appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">
              Any Location
            </option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            expand_more
          </span>
        </div>
        <div className="relative flex-grow md:w-48">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            category
          </span>
          <select
            aria-label="Filter by specialization"
            className="w-full pl-12 pr-10 py-3 bg-surface-bright border border-border-subtle rounded-lg text-body-md font-body-md appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">
              All Specializations
            </option>
            <option value="Luxury">
              Luxury
            </option>
            <option value="Residential">
              Residential
            </option>
            <option value="Commercial">
              Commercial
            </option>
          </select>
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            expand_more
          </span>
        </div>
      </div>
    </div>
  </header>
  {/* Agent Grid */}
  {error && (
    <p className="text-body-md font-body-md text-error mb-4">{error}</p>
  )}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
    {loading && (
      <p className="col-span-full text-body-md font-body-md text-on-surface-variant">Loading agents…</p>
    )}
    {!loading && agents.length === 0 && (
      <p className="col-span-full text-body-md font-body-md text-on-surface-variant">No agents match your search.</p>
    )}
    {agents.map((agent) => (
      <article key={agent.agent_id} className="bg-surface-container-lowest rounded-[16px] p-6 border border-border-subtle hover:shadow-[0px_10px_30px_rgba(15,23,42,0.05)] transition-shadow duration-300 group flex flex-col h-full">
        <div className="flex items-start justify-between mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-headline-md font-headline-md border-2 border-surface-container-lowest shadow-sm overflow-hidden">
              {agent.avatar_url ? (
                <img className="w-full h-full object-cover" src={agent.avatar_url} alt={agent.first_name} />
              ) : (
                <span>{agent.first_name?.[0]}{agent.last_name?.[0]}</span>
              )}
            </div>
            {agent.verification_status === 'verified' && (
              <div className="absolute bottom-0 right-0 bg-surface-container-lowest rounded-full p-0.5">
                <span className="material-symbols-outlined text-status-success text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>
                  verified
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="mb-4 flex-grow">
          <h3 className="text-headline-md font-headline-md text-on-background mb-1">
            {agent.first_name} {agent.last_name}
          </h3>
          <p className="text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">
              domain
            </span>
            {agent.agency_name || agent.specialty || 'Independent Agent'}
          </p>
        </div>
        <div className="flex items-center gap-2 mb-6">
          <div className="flex text-amber-400">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: n <= Math.round(agent.average_rating || 0) ? "'FILL' 1" : "'FILL' 0" }}
              >
                star
              </span>
            ))}
          </div>
          <span className="text-body-sm font-body-sm text-on-surface-variant">
            {Number(agent.average_rating || 0).toFixed(1)} ({agent.total_reviews || 0})
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 py-4 border-y border-border-subtle mb-6">
          <div className="text-center border-r border-border-subtle">
            <span className="block text-headline-md font-headline-md text-primary mb-1">
              {agent.active_listings_count ?? 0}
            </span>
            <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
              Properties Listed
            </span>
          </div>
          <div className="text-center">
            <span className="block text-headline-md font-headline-md text-primary mb-1">
              {agent.years_experience ?? '—'}
            </span>
            <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
              Years Exp.
            </span>
          </div>
        </div>
        <Link
          to={`/agent-profile/${agent.agent_id}`}
          className="w-full py-3 rounded-lg border border-border-subtle text-on-background font-label-md text-label-md hover:bg-surface-container-low transition-colors mt-auto text-center block"
        >
          View Profile
        </Link>
      </article>
    ))}
  </div>
  {pagination.totalPages > 1 && (
    <div className="mt-12 flex justify-center items-center gap-2">
      <button
        className="p-2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
        disabled={pagination.page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        type="button"
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>
      {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          className={`w-8 h-8 rounded-lg text-label-sm font-label-sm flex items-center justify-center transition-colors ${
            num === pagination.page ? 'bg-primary text-on-primary' : 'bg-surface hover:bg-surface-container-low text-on-surface'
          }`}
          onClick={() => setPage(num)}
          type="button"
        >
          {num}
        </button>
      ))}
      <button
        className="p-2 text-primary hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-50"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
        type="button"
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
  )}
</main>
{/* Footer */}
<footer className="bg-surface-container-high text-primary border-t border-border-subtle mt-auto">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter px-margin-desktop py-16 max-w-container-max mx-auto">
    <div className="mb-8 md:mb-0">
      <div className="text-headline-md font-headline-md font-bold text-primary mb-4">
        EstateHub
      </div>
      <p className="text-body-sm font-body-sm text-on-surface-variant mb-6 max-w-xs">
        Connecting you with premium real estate opportunities and top-tier professionals worldwide.
      </p>
      <div className="flex gap-4">
        <button type="button" aria-label="Change language" className="text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded-full p-1">
          <span className="material-symbols-outlined" aria-hidden="true">
            language
          </span>
        </button>
        <button type="button" aria-label="Share EstateHub" className="text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded-full p-1">
          <span className="material-symbols-outlined" aria-hidden="true">
            share
          </span>
        </button>
      </div>
    </div>
    <div>
      <h4 className="text-label-sm font-label-sm text-primary uppercase tracking-wider mb-4 font-semibold">
        Services
      </h4>
      <ul className="flex flex-col gap-3">
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/browse-properties?listingType=sale">
            Buy
          </Link>
        </li>
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/browse-properties?listingType=rent">
            Rent
          </Link>
        </li>
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/list-your-property">
            Sell
          </Link>
        </li>
      </ul>
    </div>
    <div>
      <h4 className="text-label-sm font-label-sm text-primary uppercase tracking-wider mb-4 font-semibold">
        Company
      </h4>
      <ul className="flex flex-col gap-3">
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/">
            About
          </Link>
        </li>
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/">
            Resources
          </Link>
        </li>
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/">
            Contact
          </Link>
        </li>
      </ul>
    </div>
    <div>
      <h4 className="text-label-sm font-label-sm text-primary uppercase tracking-wider mb-4 font-semibold">
        Legal
      </h4>
      <ul className="flex flex-col gap-3">
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/">
            Privacy Policy
          </Link>
        </li>
        <li>
          <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary rounded" to="/">
            Terms of Service
          </Link>
        </li>
      </ul>
    </div>
  </div>
  <div className="border-t border-border-subtle">
    <div className="px-margin-desktop py-6 max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-label-sm font-label-sm text-on-surface-variant">
        © 2024 EstateHub. All rights reserved.
      </p>
    </div>
  </div>
</footer>
    </>
  );
}