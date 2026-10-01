import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchProperties } from '../api/properties';
import PublicNavMenu from '../components/PublicNavMenu';
import { getAmenities, getPropertyTypes } from '../api/lookups';

const SIDEBAR_AMENITY_NAMES = ['Pool', 'Garage', 'Waterfront', 'Central Air'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];
// Statuses the backend's public browse endpoint is willing to serve — kept here so the UI
// never offers a checkbox for a status the API can't return (see property.controller.js).
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active Listings' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'sold', label: 'Recently Sold' },
];
const BEDROOM_OPTIONS = [1, 2, 3, 4, 5];
const BATHROOM_OPTIONS = [1, 2, 3, 4];

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString()}`;
}

function formatLocation(property) {
  return [property.neighborhood, property.city].filter(Boolean).join(', ') || property.city || '—';
}

export default function BrowseProperties() {
  const [searchParams] = useSearchParams();

  const [keyword, setKeyword] = useState('');
  const [amenityList, setAmenityList] = useState([]);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [sortIndex, setSortIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState('grid');

  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [typeId, setTypeId] = useState(searchParams.get('typeId') || '');
  const [minBedrooms, setMinBedrooms] = useState('');
  const [minBathrooms, setMinBathrooms] = useState('');
  const [minYearBuilt, setMinYearBuilt] = useState('');
  const [maxYearBuilt, setMaxYearBuilt] = useState('');
  const [statuses, setStatuses] = useState(['active']);

  const [openPanel, setOpenPanel] = useState(null); // 'price' | 'type' | 'beds' | null
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [properties, setProperties] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const listingType = searchParams.get('listingType') || 'sale';
  const city = searchParams.get('city') || '';

  useEffect(() => {
    getAmenities()
      .then((data) => setAmenityList(data.amenities || []))
      .catch(() => setAmenityList([]));
    getPropertyTypes()
      .then((data) => setPropertyTypes(data.propertyTypes || []))
      .catch(() => setPropertyTypes([]));
  }, []);

  const sidebarAmenities = useMemo(
    () => SIDEBAR_AMENITY_NAMES.map((name) => amenityList.find((a) => a.name === name)).filter(Boolean),
    [amenityList]
  );

  useEffect(() => {
    setPage(1);
  }, [
    listingType,
    city,
    typeId,
    minPrice,
    maxPrice,
    minBedrooms,
    minBathrooms,
    minYearBuilt,
    maxYearBuilt,
    statuses,
    keyword,
    selectedAmenityIds,
    sortIndex,
  ]);

  useEffect(() => {
    setLoading(true);
    setError('');
    searchProperties({
      listingType,
      city,
      typeId,
      minPrice,
      maxPrice,
      minBedrooms,
      minBathrooms,
      minYearBuilt,
      maxYearBuilt,
      status: statuses.join(','),
      keyword,
      amenities: selectedAmenityIds.join(',') || undefined,
      sortBy: SORT_OPTIONS[sortIndex].value,
      page,
      limit: 9,
    })
      .then((data) => {
        setProperties(data.properties || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      })
      .catch((err) => setError(err.message || 'Could not load properties.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    listingType,
    city,
    typeId,
    minPrice,
    maxPrice,
    minBedrooms,
    minBathrooms,
    minYearBuilt,
    maxYearBuilt,
    statuses,
    keyword,
    selectedAmenityIds,
    sortIndex,
    page,
  ]);

  const toggleAmenity = (amenityId) => {
    setSelectedAmenityIds((prev) =>
      prev.includes(amenityId) ? prev.filter((id) => id !== amenityId) : [...prev, amenityId]
    );
  };

  const toggleStatus = (value) => {
    setStatuses((prev) => {
      if (prev.includes(value)) {
        // Always keep at least one status selected so the query never goes empty.
        return prev.length === 1 ? prev : prev.filter((s) => s !== value);
      }
      return [...prev, value];
    });
  };

  const togglePanel = (name) => setOpenPanel((prev) => (prev === name ? null : name));

  const hasActivePriceFilter = minPrice !== '' || maxPrice !== '';
  const hasActiveTypeFilter = typeId !== '';
  const hasActiveBedsBathsFilter = minBedrooms !== '' || minBathrooms !== '';
  const selectedTypeName = propertyTypes.find((t) => String(t.type_id) === String(typeId))?.name;

  const clearAllFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setTypeId('');
    setMinBedrooms('');
    setMinBathrooms('');
    setMinYearBuilt('');
    setMaxYearBuilt('');
    setStatuses(['active']);
    setSelectedAmenityIds([]);
    setOpenPanel(null);
  };

  const filterPanelButtonClass = (active) =>
    `px-4 py-2 rounded-lg border text-body-sm font-body-sm flex items-center gap-2 transition-colors ${
      active
        ? 'bg-primary/10 border-primary text-primary'
        : 'bg-surface border-border-subtle text-on-surface hover:border-primary'
    }`;

  // Shared advanced-filter content, reused for the desktop sidebar and the mobile "More
  // Filters" slide-down so both surfaces stay in sync with the same state.
  const advancedFilters = (
    <>
      <div>
        <h3 className="text-label-md font-label-md text-on-background mb-4 uppercase tracking-wider">
          Property Status
        </h3>
        <div className="space-y-3">
          {STATUS_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-3 cursor-pointer group">
              <input
                className="w-4 h-4 rounded border-border-subtle text-primary focus:ring-primary"
                type="checkbox"
                checked={statuses.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
              />
              <span className="text-body-sm font-body-sm text-on-surface-variant group-hover:text-primary transition-colors">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>
      <hr className="border-border-subtle" />
      <div>
        <h3 className="text-label-md font-label-md text-on-background mb-4 uppercase tracking-wider">
          Amenities
        </h3>
        <div className="space-y-3">
          {sidebarAmenities.map((amenity) => (
            <label key={amenity.amenity_id} className="flex items-center gap-3 cursor-pointer group">
              <input
                className="w-4 h-4 rounded border-border-subtle text-primary focus:ring-primary"
                type="checkbox"
                checked={selectedAmenityIds.includes(amenity.amenity_id)}
                onChange={() => toggleAmenity(amenity.amenity_id)}
              />
              <span className="text-body-sm font-body-sm text-on-surface-variant group-hover:text-primary transition-colors">
                {amenity.name}
              </span>
            </label>
          ))}
        </div>
      </div>
      <hr className="border-border-subtle" />
      <div>
        <h3 id="year-built-heading" className="text-label-md font-label-md text-on-background mb-4 uppercase tracking-wider">
          Year Built
        </h3>
        <div className="flex gap-2">
          <input
            aria-label="Minimum year built"
            className="w-full px-3 py-2 bg-surface rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-sm font-body-sm text-on-surface outline-none transition-colors"
            placeholder="Min"
            type="number"
            value={minYearBuilt}
            onChange={(e) => setMinYearBuilt(e.target.value)}
          />
          <input
            aria-label="Maximum year built"
            className="w-full px-3 py-2 bg-surface rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-sm font-body-sm text-on-surface outline-none transition-colors"
            placeholder="Max"
            type="number"
            value={maxYearBuilt}
            onChange={(e) => setMaxYearBuilt(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={clearAllFilters}
        className="text-body-sm font-body-sm text-primary hover:underline"
      >
        Clear all filters
      </button>
    </>
  );

  return (
    <>
{/* TopNavBar from JSON */}
<header className="bg-surface-container-lowest border-b border-border-subtle shadow-sm sticky top-0 z-50">
  <div className="flex justify-between items-center w-full px-margin-desktop max-w-container-max mx-auto h-20">
    <div className="flex items-center gap-8">
      <Link className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary" to="/">
        EstateHub
      </Link>
      <nav className="hidden md:flex gap-6">
        <Link className="text-primary font-bold border-b-2 border-primary pb-1 transition-colors duration-200" to="/browse-properties?listingType=sale">
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
        <Link className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200" to="/browse-properties">
          Explore
        </Link>
      </nav>
    </div>
    <div className="flex items-center gap-4">
      <Link className="hidden md:block text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors" to="/sign-in">
        Sign In
      </Link>
      <Link className="hidden md:inline-block bg-primary text-on-primary px-6 py-2 rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity" to="/list-your-property">
        List Your Property
      </Link>
      <PublicNavMenu />
    </div>
  </div>
</header>
{/* Filter Bar */}
<div className="bg-surface-container-lowest border-b border-border-subtle sticky top-20 z-40">
  <div className="max-w-container-max mx-auto px-margin-desktop py-4 flex flex-wrap items-center gap-4">
    <div className="relative flex-1 min-w-[200px]">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
        search
      </span>
      <input aria-label="Search by location, neighborhood, or MLS#" className="w-full pl-10 pr-4 py-2 bg-surface rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary text-body-sm font-body-sm text-on-surface outline-none transition-colors" placeholder="Search by location, neighborhood, or MLS#" type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
    </div>
    <div className="flex items-center gap-2 flex-wrap relative">
      <div className="relative">
        <button type="button" className={filterPanelButtonClass(hasActivePriceFilter)} onClick={() => togglePanel('price')}>
          {hasActivePriceFilter
            ? `${minPrice ? formatPrice(minPrice) : 'Any'} – ${maxPrice ? formatPrice(maxPrice) : 'Any'}`
            : 'Price'}
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        {openPanel === 'price' && (
          <div className="absolute left-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-border-subtle rounded-lg shadow-lg p-4 space-y-3">
            <label className="block text-label-sm font-label-sm text-on-surface-variant" htmlFor="filter-min-price">Min price</label>
            <input id="filter-min-price" className="w-full px-3 py-2 bg-surface rounded-lg border border-border-subtle text-body-sm outline-none focus:border-primary" type="number" min="0" placeholder="No min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <label className="block text-label-sm font-label-sm text-on-surface-variant" htmlFor="filter-max-price">Max price</label>
            <input id="filter-max-price" className="w-full px-3 py-2 bg-surface rounded-lg border border-border-subtle text-body-sm outline-none focus:border-primary" type="number" min="0" placeholder="No max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            <button type="button" className="text-label-sm text-primary hover:underline" onClick={() => setOpenPanel(null)}>Done</button>
          </div>
        )}
      </div>
      <div className="relative">
        <button type="button" className={filterPanelButtonClass(hasActiveTypeFilter)} onClick={() => togglePanel('type')}>
          {selectedTypeName || 'Type'}
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        {openPanel === 'type' && (
          <div className="absolute left-0 z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-border-subtle rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto">
            <button
              type="button"
              className={`w-full text-left px-3 py-2 rounded-md text-body-sm ${typeId === '' ? 'text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-low'}`}
              onClick={() => { setTypeId(''); setOpenPanel(null); }}
            >
              Any type
            </button>
            {propertyTypes.map((t) => (
              <button
                key={t.type_id}
                type="button"
                className={`w-full text-left px-3 py-2 rounded-md text-body-sm ${String(typeId) === String(t.type_id) ? 'text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-low'}`}
                onClick={() => { setTypeId(t.type_id); setOpenPanel(null); }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <button type="button" className={filterPanelButtonClass(hasActiveBedsBathsFilter)} onClick={() => togglePanel('beds')}>
          Beds &amp; Baths
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        {openPanel === 'beds' && (
          <div className="absolute left-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-border-subtle rounded-lg shadow-lg p-4 space-y-4">
            <div>
              <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">Min bedrooms</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`px-3 py-1 rounded-md border text-body-sm ${minBedrooms === '' ? 'border-primary text-primary' : 'border-border-subtle text-on-surface'}`} onClick={() => setMinBedrooms('')}>Any</button>
                {BEDROOM_OPTIONS.map((n) => (
                  <button key={n} type="button" className={`px-3 py-1 rounded-md border text-body-sm ${String(minBedrooms) === String(n) ? 'border-primary text-primary' : 'border-border-subtle text-on-surface'}`} onClick={() => setMinBedrooms(n)}>{n}+</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">Min bathrooms</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`px-3 py-1 rounded-md border text-body-sm ${minBathrooms === '' ? 'border-primary text-primary' : 'border-border-subtle text-on-surface'}`} onClick={() => setMinBathrooms('')}>Any</button>
                {BATHROOM_OPTIONS.map((n) => (
                  <button key={n} type="button" className={`px-3 py-1 rounded-md border text-body-sm ${String(minBathrooms) === String(n) ? 'border-primary text-primary' : 'border-border-subtle text-on-surface'}`} onClick={() => setMinBathrooms(n)}>{n}+</button>
                ))}
              </div>
            </div>
            <button type="button" className="text-label-sm text-primary hover:underline" onClick={() => setOpenPanel(null)}>Done</button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="px-4 py-2 bg-primary text-on-primary rounded-lg text-body-sm font-body-sm flex items-center gap-2 hover:opacity-90 transition-opacity md:hidden"
        onClick={() => setMobileFiltersOpen((v) => !v)}
      >
        <span className="material-symbols-outlined text-[18px]">tune</span>
        More Filters
      </button>
    </div>
  </div>
  {mobileFiltersOpen && (
    <div className="md:hidden border-t border-border-subtle px-margin-mobile py-4 space-y-6 max-h-[70vh] overflow-y-auto">
      {advancedFilters}
    </div>
  )}
</div>
{/* Main Content Area */}
<main className="flex-1 max-w-container-max mx-auto w-full px-margin-desktop py-8 flex flex-col md:flex-row gap-8">
  {/* Sidebar (Advanced Filters) */}
  <aside className="w-full md:w-64 flex-shrink-0 hidden md:block">
    <div className="sticky top-40 space-y-6">
      {advancedFilters}
    </div>
  </aside>
  {/* Results Grid */}
  <div className="flex-1">
    {/* Results Header */}
    <div className="flex justify-between items-end mb-6">
      <div>
        <h1 className="text-headline-md font-headline-md text-on-background">
          Properties for {listingType === 'rent' ? 'Rent' : 'Sale'}
        </h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
          {loading ? 'Searching…' : `${pagination.total} properties found${city ? ` in ${city}` : ''}`}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-body-sm text-on-surface-variant">
            Sort by:
          </span>
          <button
            className="flex items-center gap-1 text-body-sm font-body-sm text-primary font-medium"
            type="button"
            onClick={() => setSortIndex((i) => (i + 1) % SORT_OPTIONS.length)}
          >
            {SORT_OPTIONS[sortIndex].label}
            <span className="material-symbols-outlined text-[16px]">
              expand_more
            </span>
          </button>
        </div>
        <div className="flex items-center bg-surface border border-border-subtle rounded-lg overflow-hidden">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            className={`p-2 ${viewMode === 'grid' ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant hover:text-primary transition-colors'}`}
            onClick={() => setViewMode('grid')}
          >
            <span className="material-symbols-outlined text-[20px]" data-weight="fill">
              grid_view
            </span>
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            className={`p-2 ${viewMode === 'list' ? 'bg-surface-container-low text-primary' : 'text-on-surface-variant hover:text-primary transition-colors'}`}
            onClick={() => setViewMode('list')}
          >
            <span className="material-symbols-outlined text-[20px]">
              view_list
            </span>
          </button>
        </div>
      </div>
    </div>
    {/* Grid */}
    {error && (
      <p className="text-body-md font-body-md text-error mb-4">{error}</p>
    )}
    <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'flex flex-col gap-4'}>
      {loading && (
        <p className="col-span-full text-body-md font-body-md text-on-surface-variant">Loading properties…</p>
      )}
      {!loading && properties.length === 0 && (
        <p className="col-span-full text-body-md font-body-md text-on-surface-variant">No properties match your filters.</p>
      )}
      {properties.map((property) => (
        <Link
          key={property.property_id}
          to={`/property-details/${property.property_id}`}
          className={
            viewMode === 'grid'
              ? 'bg-surface-container-lowest border border-border-subtle rounded-[16px] overflow-hidden group hover:shadow-[0px_10px_30px_rgba(15,23,42,0.05)] transition-shadow duration-300 block'
              : 'bg-surface-container-lowest border border-border-subtle rounded-[16px] overflow-hidden group hover:shadow-[0px_10px_30px_rgba(15,23,42,0.05)] transition-shadow duration-300 flex flex-col sm:flex-row'
          }
        >
          <div className={viewMode === 'grid' ? 'relative h-48 w-full overflow-hidden bg-surface-container' : 'relative h-48 sm:h-auto sm:w-64 flex-shrink-0 overflow-hidden bg-surface-container'}>
            {property.primary_image_url ? (
              <img className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" src={property.primary_image_url} alt={property.title} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px]">home</span>
              </div>
            )}
            {property.is_featured ? (
              <div className="absolute top-3 left-3 flex gap-2">
                <span className="bg-primary text-on-primary px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  Featured
                </span>
              </div>
            ) : null}
            {property.status !== 'active' ? (
              <div className="absolute bottom-3 left-3 flex gap-2">
                <span className="bg-on-background/80 text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  {property.status === 'under_contract' ? 'Under Contract' : property.status === 'sold' ? 'Sold' : property.status}
                </span>
              </div>
            ) : null}
            <button className="absolute top-3 right-3 p-1.5 bg-surface-container-lowest/80 backdrop-blur rounded-full text-on-surface hover:text-error transition-colors" type="button" onClick={(e) => e.preventDefault()}>
              <span className="material-symbols-outlined text-[18px]">
                favorite
              </span>
            </button>
          </div>
          <div className="p-4 flex-1">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-headline-md font-headline-md text-primary leading-tight">
                {property.title}
              </h2>
            </div>
            <p className="text-body-sm font-body-sm text-on-surface-variant mb-1 font-semibold">
              {(() => {
                const num = Number(property.price);
                return Number.isNaN(num) ? property.price : `$${num.toLocaleString()}`;
              })()}
            </p>
            <p className="text-body-sm font-body-sm text-on-surface-variant mb-4 truncate">
              {[property.neighborhood, property.city].filter(Boolean).join(', ') || property.city || '—'}
            </p>
            <div className="flex items-center gap-4 text-label-sm font-label-sm text-on-surface mb-4">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  bed
                </span>
                {property.bedrooms ?? '—'}
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  shower
                </span>
                {property.bathrooms ?? '—'}
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  square_foot
                </span>
                {property.area_sqft ? Number(property.area_sqft).toLocaleString() : '—'}
              </div>
            </div>
            <hr className="border-border-subtle mb-4" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-primary font-bold text-label-sm">
                  EH
                </div>
                <span className="text-label-sm font-label-sm text-on-background">
                  {property.type_name}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
    {/* Pagination */}
    {pagination.totalPages > 1 && (
      <div className="mt-12 flex justify-center items-center gap-2">
        <button
          className="p-2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
          disabled={pagination.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          type="button"
        >
          <span className="material-symbols-outlined">
            chevron_left
          </span>
        </button>
        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            className={`w-8 h-8 rounded-lg text-label-sm font-label-sm flex items-center justify-center transition-colors ${
              pageNum === pagination.page
                ? 'bg-primary text-on-primary'
                : 'bg-surface hover:bg-surface-container-low text-on-surface'
            }`}
            onClick={() => setPage(pageNum)}
            type="button"
          >
            {pageNum}
          </button>
        ))}
        <button
          className="p-2 text-primary hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-50"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
          type="button"
        >
          <span className="material-symbols-outlined">
            chevron_right
          </span>
        </button>
      </div>
    )}
  </div>
</main>
{/* Footer from JSON */}
<footer className="bg-surface-container-high border-t border-border-subtle mt-auto">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter px-margin-desktop py-16 max-w-container-max mx-auto">
    <div>
      <span className="text-headline-md font-headline-md font-bold text-primary block mb-4">
        EstateHub
      </span>
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        © 2024 EstateHub. All rights reserved.
      </p>
    </div>
    <div className="flex flex-col gap-2">
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/browse-properties?listingType=sale">
        Buy
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/browse-properties?listingType=rent">
        Rent
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/list-your-property">
        Sell
      </Link>
    </div>
    <div className="flex flex-col gap-2">
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/">
        Resources
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/">
        About
      </Link>
      <Link className="text-body-sm font-body-sm text-on-surface-variant hover:text-primary transition-colors focus:ring-2 focus:ring-primary w-fit" to="/">
        Contact
      </Link>
    </div>
  </div>
</footer>
    </>
  );
}
