import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchProperties } from '../api/properties';
import { getPropertyTypes } from '../api/lookups';
import PublicNavMenu from '../components/PublicNavMenu';

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString()}`;
}

function formatLocation(property) {
  return [property.neighborhood, property.city].filter(Boolean).join(', ') || property.city;
}

export default function Home() {
  const navigate = useNavigate();

  const [listingType, setListingType] = useState('sale');
  const [location, setLocation] = useState('');
  const [typeId, setTypeId] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [propertyTypes, setPropertyTypes] = useState([]);

  const [featured, setFeatured] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    getPropertyTypes()
      .then((data) => setPropertyTypes(data.propertyTypes || []))
      .catch(() => setPropertyTypes([]));

    searchProperties({ limit: 4, sortBy: 'newest' })
      .then((data) => setFeatured(data.properties || []))
      .catch(() => setFeatured([]))
      .finally(() => setFeaturedLoading(false));
  }, []);

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set('listingType', listingType);
    if (location) params.set('city', location);
    if (typeId) params.set('typeId', typeId);
    if (maxPrice) params.set('maxPrice', maxPrice);
    navigate(`/browse-properties?${params.toString()}`);
  };

  return (
    <>
{/* TopNavBar */}
<header className="bg-surface-container-lowest dark:bg-primary-container text-primary dark:text-on-primary docked full-width top-0 border-b border-border-subtle dark:border-outline-variant shadow-sm dark:shadow-none flex sticky z-50">
  <div className="flex justify-between items-center w-full px-margin-desktop max-w-container-max mx-auto h-20">
    <div className="flex items-center gap-8">
      <Link className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary dark:text-on-primary" to="/">
        EstateHub
      </Link>
      <nav className="hidden lg:flex gap-6">
        <Link className="text-primary dark:text-on-primary font-bold border-b-2 border-primary dark:border-on-primary pb-1 text-label-md font-label-md opacity-80 scale-95 transition-all" to="/browse-properties?listingType=sale">
          Buy
        </Link>
        <Link className="text-on-surface-variant dark:text-on-primary-container font-medium hover:text-primary dark:hover:text-on-primary transition-colors duration-200 text-label-md font-label-md" to="/browse-properties?listingType=rent">
          Rent
        </Link>
        <Link className="text-on-surface-variant dark:text-on-primary-container font-medium hover:text-primary dark:hover:text-on-primary transition-colors duration-200 text-label-md font-label-md" to="/list-your-property">
          Sell
        </Link>
        <Link className="text-on-surface-variant dark:text-on-primary-container font-medium hover:text-primary dark:hover:text-on-primary transition-colors duration-200 text-label-md font-label-md" to="/find-an-agent">
          Agents
        </Link>
        <Link className="text-on-surface-variant dark:text-on-primary-container font-medium hover:text-primary dark:hover:text-on-primary transition-colors duration-200 text-label-md font-label-md" to="/browse-properties">
          Explore
        </Link>
      </nav>
    </div>
    <div className="flex items-center gap-4">
      <Link className="text-on-surface-variant hover:text-primary transition-colors text-label-md font-label-md hidden lg:block" to="/sign-in">
        Sign In
      </Link>
      <Link className="bg-primary text-on-primary px-6 py-2.5 rounded-lg text-label-md font-label-md hover:bg-opacity-90 transition-all shadow-md hidden lg:inline-block" to="/list-your-property">
        List Your Property
      </Link>
      <PublicNavMenu breakpoint="lg" />
    </div>
  </div>
</header>
{/* Main Content */}
<main>
  {/* Hero Section */}
  <section className="relative min-h-[819px] flex flex-col items-center justify-center px-margin-mobile md:px-margin-desktop overflow-hidden">
    {/* Background Image */}
    <div className="absolute inset-0 z-0">
      <img
        src="/assets/images/estatehub-hero.jpg"
        alt=""
        aria-hidden="true"
        fetchpriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[68%_50%] md:object-[60%_50%] lg:object-center"
      />
      {/* Light overlay: only enough to keep the white hero text readable; fades into the page surface below */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-surface">
      </div>
    </div>
    {/* Hero Content */}
    <div className="relative z-10 text-center max-w-4xl mx-auto mt-20">
      <h1 className="text-headline-xl font-headline-xl text-white mb-6 drop-shadow-lg">
        Find a place you'll love to call home.
      </h1>
      <p className="text-body-lg font-body-lg text-white/90 mb-12 max-w-2xl mx-auto drop-shadow-md">
        Discover exclusive, verified luxury properties tailored to your lifestyle. Exceptional homes for exceptional living.
      </p>
    </div>
    {/* Integrated Search Bar */}
    <div className="relative z-20 w-full max-w-5xl mx-auto -mt-8 glass-panel rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] p-4 border border-white/40">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        {/* Buy/Rent Toggle */}
        <div className="flex bg-surface-container-low rounded-lg p-1 w-full md:w-auto">
          <button
            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-label-md font-label-md transition-all ${listingType === 'sale' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-primary'}`}
            onClick={() => setListingType('sale')}
            type="button"
          >
            Buy
          </button>
          <button
            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-label-md font-label-md transition-all ${listingType === 'rent' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-primary'}`}
            onClick={() => setListingType('rent')}
            type="button"
          >
            Rent
          </button>
        </div>
        {/* Search Inputs */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          <div className="relative flex items-center border border-border-subtle rounded-lg bg-white overflow-hidden group hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant pl-3">
              location_on
            </span>
            <input aria-label="Location" className="w-full border-none focus:ring-0 text-body-md font-body-md py-3 pr-3 text-primary bg-transparent placeholder:text-on-surface-variant/60" placeholder="Location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="relative flex items-center border border-border-subtle rounded-lg bg-white overflow-hidden group hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant pl-3">
              home
            </span>
            <select aria-label="Property type" className="w-full border-none focus:ring-0 text-body-md font-body-md py-3 pr-3 text-primary bg-transparent appearance-none" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">
                Property Type
              </option>
              {propertyTypes.map((pt) => (
                <option key={pt.type_id} value={pt.type_id}>{pt.name}</option>
              ))}
            </select>
          </div>
          <div className="relative flex items-center border border-border-subtle rounded-lg bg-white overflow-hidden group hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant pl-3">
              payments
            </span>
            <select aria-label="Maximum price" className="w-full border-none focus:ring-0 text-body-md font-body-md py-3 pr-3 text-primary bg-transparent appearance-none" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}>
              <option value="">
                Max Price
              </option>
              <option value="500000">
                $500k
              </option>
              <option value="1000000">
                $1M+
              </option>
            </select>
          </div>
        </div>
        {/* Search Button */}
        <button className="w-full md:w-auto bg-primary text-on-primary px-8 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all text-label-md font-label-md h-full" onClick={handleSearch} type="button">
          <span className="material-symbols-outlined">
            search
          </span>
          Search
        </button>
      </div>
      {/* Quick Links */}
      <div className="mt-4 flex items-center gap-3 text-label-sm font-label-sm text-on-surface-variant overflow-x-auto pb-1 whitespace-nowrap">
        <span>
          Popular:
        </span>
        <Link className="px-3 py-1 bg-white/50 border border-border-subtle rounded-full hover:bg-white hover:border-primary transition-colors" to={`/browse-properties?city=${encodeURIComponent('Dubai Marina')}`}>
          Dubai Marina
        </Link>
        <Link className="px-3 py-1 bg-white/50 border border-border-subtle rounded-full hover:bg-white hover:border-primary transition-colors" to={`/browse-properties?city=${encodeURIComponent('DHA Lahore')}`}>
          DHA Lahore
        </Link>
        <Link className="px-3 py-1 bg-white/50 border border-border-subtle rounded-full hover:bg-white hover:border-primary transition-colors" to={`/browse-properties?city=${encodeURIComponent('Islamabad F-8')}`}>
          Islamabad F-8
        </Link>
      </div>
    </div>
  </section>
  {/* Featured Properties */}
  <section className="py-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
    <div className="flex justify-between items-end mb-12">
      <div>
        <h2 className="text-headline-lg font-headline-lg text-primary mb-2">
          Curated for You
        </h2>
        <p className="text-body-md font-body-md text-on-surface-variant">
          Exclusive premium listings selected for your taste.
        </p>
      </div>
      <Link className="hidden md:flex items-center gap-1 text-primary text-label-md font-label-md hover:underline" to="/browse-properties">
        View All
        <span className="material-symbols-outlined text-[18px]">
          arrow_forward
        </span>
      </Link>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
      {featuredLoading && (
        <p className="col-span-full text-body-md font-body-md text-on-surface-variant">Loading properties…</p>
      )}
      {!featuredLoading && featured.length === 0 && (
        <p className="col-span-full text-body-md font-body-md text-on-surface-variant">No properties available yet.</p>
      )}
      {featured.map((property) => (
        <Link
          key={property.property_id}
          to={`/property-details/${property.property_id}`}
          className="bg-surface-container-lowest rounded-xl border border-border-subtle overflow-hidden group cursor-pointer hover:shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-all duration-300"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
            {property.primary_image_url ? (
              <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src={property.primary_image_url} alt={property.title} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px]">home</span>
              </div>
            )}
            {property.is_featured ? (
              <div className="absolute top-4 left-4 bg-primary text-on-primary px-3 py-1 rounded-md text-label-sm font-label-sm font-semibold tracking-wide uppercase">
                Featured
              </div>
            ) : null}
            <button className="absolute top-4 right-4 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error transition-colors backdrop-blur-sm" type="button" onClick={(e) => e.preventDefault()}>
              <span className="material-symbols-outlined text-[18px]">
                favorite
              </span>
            </button>
          </div>
          <div className="p-5">
            <p className="text-headline-md font-headline-md text-primary mb-1">
              {formatPrice(property.price)}
            </p>
            <p className="text-body-sm font-body-sm text-on-surface-variant mb-4 truncate">
              {formatLocation(property)}
            </p>
            <div className="flex items-center justify-between border-t border-border-subtle pt-4 text-label-sm font-label-sm text-on-surface-variant">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">
                  bed
                </span>
                {property.bedrooms ?? '—'} Beds
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">
                  bathtub
                </span>
                {property.bathrooms ?? '—'} Baths
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">
                  square_foot
                </span>
                {property.area_sqft ? `${Number(property.area_sqft).toLocaleString()} sqft` : '—'}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
    <Link className="md:hidden mt-8 w-full flex items-center justify-center gap-2 border border-border-subtle py-3 rounded-lg text-label-md font-label-md text-primary" to="/browse-properties">
      View All Properties
    </Link>
  </section>
</main>
{/* Footer */}
<footer className="bg-surface-container-high dark:bg-primary-container text-primary dark:text-on-primary full-width border-t border-border-subtle dark:border-outline-variant mt-20">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter px-margin-desktop py-16 max-w-container-max mx-auto">
    <div className="col-span-1 md:col-span-1">
      <h3 className="text-headline-md font-headline-md font-bold text-primary dark:text-on-primary mb-4">
        EstateHub
      </h3>
      <p className="text-body-sm font-body-sm text-on-surface-variant dark:text-on-primary-container">
        © 2024 EstateHub. All rights reserved.
      </p>
    </div>
    <div>
      <h4 className="text-label-md font-label-md font-bold mb-4">
        Properties
      </h4>
      <ul className="space-y-2 text-body-sm font-body-sm text-on-surface-variant dark:text-on-primary-container">
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary text-primary dark:text-on-primary underline" to="/browse-properties?listingType=sale">
            Buy
          </Link>
        </li>
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary" to="/browse-properties?listingType=rent">
            Rent
          </Link>
        </li>
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary" to="/list-your-property">
            Sell
          </Link>
        </li>
      </ul>
    </div>
    <div>
      <h4 className="text-label-md font-label-md font-bold mb-4">
        Company
      </h4>
      <ul className="space-y-2 text-body-sm font-body-sm text-on-surface-variant dark:text-on-primary-container">
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary" to="/">
            About
          </Link>
        </li>
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary" to="/">
            Contact
          </Link>
        </li>
        <li>
          <Link className="hover:text-primary dark:hover:text-on-primary transition-colors focus:ring-2 focus:ring-primary" to="/">
            Resources
          </Link>
        </li>
      </ul>
    </div>
  </div>
</footer>
    </>
  );
}