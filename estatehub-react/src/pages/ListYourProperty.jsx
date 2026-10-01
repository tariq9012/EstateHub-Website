import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPropertyTypes, getAmenities } from '../api/lookups';
import {
  createProperty,
  updateProperty,
  getProperty,
  addPropertyImages,
  setPropertyAmenities,
  deletePropertyImage,
  setPrimaryPropertyImage,
} from '../api/properties';
import { PROPERTY_STATUS, toneClass } from '../components/agent/agentUtils';

// Image rules (mirror the server: 5 MB each, common web formats, 30 per listing).
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 30;
const EDITABLE_STATUSES = ['draft', 'pending_review', 'rejected', 'active'];

const STEPS = [
  { number: 1, label: 'Basic Info' },
  { number: 2, label: 'Details & Photos' },
  { number: 3, label: 'Amenities' },
  { number: 4, label: 'Review' },
];

const inputClass =
  'w-full rounded-lg border-border-subtle bg-surface-container-lowest focus:border-primary focus:ring-primary font-body-md text-body-md text-on-surface placeholder:text-outline py-3 px-4 transition-colors';
const labelClass = 'block font-label-md text-label-md text-primary mb-2';

/**
 * Create AND edit share this one implementation.
 *   /list-your-property       -> create
 *   /edit-property/:id        -> edit (fields prefilled from GET /properties/:id, saved with PUT /properties/:id)
 * Moderation is enforced by the server: editing a live listing sends it back to review, a draft or
 * rejected listing enters review only when submitted.
 */
export default function ListYourProperty() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const editId = idParam ? Number(idParam) : null;
  const isEdit = Number.isInteger(editId) && editId > 0;

  // A listing created earlier in THIS session (e.g. photos failed to upload): retrying updates it instead of creating a duplicate.
  const [createdId, setCreatedId] = useState(null);
  const targetId = isEdit ? editId : createdId;

  const [loadingProperty, setLoadingProperty] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [propertyStatus, setPropertyStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [imageBusyId, setImageBusyId] = useState(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [forbidden, setForbidden] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState([]);

  const initialStep = Number(searchParams.get('step'));
  const [step, setStep] = useState(isEdit && initialStep >= 1 && initialStep <= 4 ? initialStep : 1);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [amenityList, setAmenityList] = useState([]);

  // Step 1: Basic Info
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState('');
  const [listingType, setListingType] = useState('sale');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [areaSqft, setAreaSqft] = useState('');

  // Step 2: Details & Photos
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [country, setCountry] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Step 3: Amenities
  const [selectedAmenityIds, setSelectedAmenityIds] = useState([]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [stepError, setStepError] = useState('');

  useEffect(() => {
    getPropertyTypes()
      .then((data) => setPropertyTypes(data.propertyTypes || []))
      .catch(() => setPropertyTypes([]));
    getAmenities()
      .then((data) => setAmenityList(data.amenities || []))
      .catch(() => setAmenityList([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    setLoadingProperty(true);
    setLoadError('');
    getProperty(editId)
      .then((data) => {
        if (cancelled) return;
        const p = data.property;
        const mine =
          user?.role === 'admin' || p.listed_by_user_id === user?.user_id || (user?.agentProfile?.agent_id && p.agent_id === user.agentProfile.agent_id);
        setForbidden(!mine);
        setTitle(p.title || '');
        setTypeId(p.type_id ? String(p.type_id) : '');
        setListingType(p.listing_type || 'sale');
        setPrice(p.price !== null && p.price !== undefined ? String(Number(p.price)) : '');
        setBedrooms(p.bedrooms ?? '');
        setBathrooms(p.bathrooms ?? '');
        setAreaSqft(p.area_sqft ?? '');
        setAddressLine(p.address_line || '');
        setCity(p.city || '');
        setNeighborhood(p.neighborhood || '');
        setCountry(p.country || '');
        setLatitude(p.latitude !== null && p.latitude !== undefined ? String(p.latitude) : '');
        setLongitude(p.longitude !== null && p.longitude !== undefined ? String(p.longitude) : '');
        setDescription(p.description || '');
        setSelectedAmenityIds((p.amenities || []).map((a) => a.amenity_id));
        setExistingImages(p.images || []);
        setPropertyStatus(p.status);
        setRejectionReason(p.rejection_reason || '');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load this listing.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProperty(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isEdit, loadNonce, user?.user_id]);

  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setImagePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  const addFiles = (fileList) => {
    const accepted = [];
    const problems = [];
    Array.from(fileList || []).forEach((file) => {
      if (!IMAGE_TYPES.includes(file.type)) problems.push(`“${file.name}” isn’t a supported image (use JPG, PNG, WebP or GIF).`);
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`“${file.name}” is larger than 5 MB.`);
      else accepted.push(file);
    });
    const room = MAX_IMAGES - existingImages.length - images.length;
    if (accepted.length > room) problems.push(`A listing can have at most ${MAX_IMAGES} photos; extra files were skipped.`);
    setUploadWarnings(problems);
    setImages((prev) => [...prev, ...accepted.slice(0, Math.max(0, room))]);
  };

  const handleRemoveExistingImage = async (image) => {
    if (imageBusyId) return;
    setImageBusyId(image.image_id);
    setError('');
    try {
      const data = await deletePropertyImage(targetId, image.image_id);
      setExistingImages(data.images || []);
    } catch (err) {
      setError(err.message || 'Could not remove that photo.');
    } finally {
      setImageBusyId(null);
    }
  };

  const handleMakePrimary = async (image) => {
    if (imageBusyId) return;
    setImageBusyId(image.image_id);
    setError('');
    try {
      const data = await setPrimaryPropertyImage(targetId, image.image_id);
      setExistingImages(data.images || []);
    } catch (err) {
      setError(err.message || 'Could not change the main photo.');
    } finally {
      setImageBusyId(null);
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const toggleAmenity = (id) => {
    setSelectedAmenityIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const validateStep = (current) => {
    if (current === 1) {
      if (!title.trim()) return 'Property title is required.';
      if (!typeId) return 'Please select a property type.';
      if (!price || Number(price) <= 0) return 'Please enter a valid price.';
    }
    if (current === 2) {
      if (!addressLine.trim()) return 'Address is required.';
      if (!city.trim()) return 'City is required.';
      if (!country.trim()) return 'Country is required.';
    }
    return '';
  };

  const goNext = () => {
    const msg = validateStep(step);
    if (msg) {
      setStepError(msg);
      return;
    }
    setStepError('');
    setStep((s) => Math.min(4, s + 1));
  };

  const goBack = () => {
    setStepError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const buildPayload = () => ({
    typeId: Number(typeId),
    title,
    description: description || undefined,
    price: Number(price),
    listingType,
    bedrooms: bedrooms !== '' ? Number(bedrooms) : undefined,
    bathrooms: bathrooms !== '' ? Number(bathrooms) : undefined,
    areaSqft: areaSqft !== '' ? Number(areaSqft) : undefined,
    addressLine,
    city,
    neighborhood: neighborhood || undefined,
    country,
    latitude: latitude !== '' ? Number(latitude) : undefined,
    longitude: longitude !== '' ? Number(longitude) : undefined,
  });

  /**
   * asDraft: create mode -> save as a draft. Edit mode -> keep a draft/rejected listing as it is (no submission).
   * !asDraft: create mode -> submit for review. Edit mode -> submit a draft/rejected listing for review
   *           (an active/pending listing is simply saved; the server decides the resulting status).
   */
  const submitProperty = async (asDraft) => {
    const msg = validateStep(1) || validateStep(2);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setSubmitting(true);
    let propertyId = targetId;
    let statusChanged = false;
    try {
      if (propertyId) {
        const payload = { ...buildPayload(), submitForReview: !asDraft };
        const data = await updateProperty(propertyId, payload);
        statusChanged = Boolean(data.statusChanged);
        if (data.property?.status) setPropertyStatus(data.property.status);
      } else {
        const { property } = await createProperty({ ...buildPayload(), saveAsDraft: asDraft });
        propertyId = property.property_id;
        setCreatedId(propertyId); // from now on, retries update this listing rather than creating another
        setPropertyStatus(property.status);
      }

      if (images.length > 0) {
        const formData = new FormData();
        images.forEach((file) => formData.append('images', file));
        const uploaded = await addPropertyImages(propertyId, formData);
        setImages([]);
        setExistingImages(uploaded.images || []);
        statusChanged = statusChanged || Boolean(uploaded.statusChanged);
      }

      if (selectedAmenityIds.length > 0 || isEdit || createdId) {
        await setPropertyAmenities(propertyId, selectedAmenityIds);
      }

      if (isEdit || createdId) {
        const wasLive = propertyStatus === 'active';
        const message = statusChanged
          ? wasLive
            ? 'Changes saved. Your listing is back in review and hidden from search until it is approved again.'
            : 'Changes saved and submitted for review.'
          : 'Changes saved.';
        navigate('/my-listings', { state: { flash: message } });
      } else {
        navigate('/submission-success', { state: { kind: 'property', propertyId, isDraft: asDraft } });
      }
    } catch (err) {
      const partial = propertyId && !targetId;
      setError(
        partial
          ? `Your listing was saved, but something went wrong afterwards: ${err.message || 'please try again'}. Press the button again to finish — it will update this listing, not create a new one.`
          : err.message || 'Could not save your property. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = propertyTypes.find((t) => String(t.type_id) === String(typeId));

  return (
    <>
      {/* TopNavBar (Transactional Intent - Minimal Navigation Canvas Priority) */}
      <header className="bg-surface-container-lowest border-b border-border-subtle shadow-sm docked full-width top-0 z-50">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-20">
          <span className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">
            EstateHub
          </span>
          <button
            className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200"
            onClick={() => navigate(isEdit || user?.role === 'agent' ? '/my-listings' : '/')}
            type="button"
          >
            Cancel
          </button>
        </div>
      </header>
      {/* Main Content Canvas */}
      <main className="flex-grow max-w-container-max mx-auto w-full px-margin-mobile md:px-margin-desktop py-12">
        {isEdit && loadingProperty && (
          <div className="max-w-3xl mx-auto py-16 text-center text-on-surface-variant" role="status" aria-label="Loading listing">
            <span className="material-symbols-outlined animate-pulse text-4xl">progress_activity</span>
            <p className="mt-3 text-body-md font-body-md">Loading your listing…</p>
          </div>
        )}
        {isEdit && !loadingProperty && loadError && (
          <div className="max-w-3xl mx-auto py-16 text-center" role="alert">
            <p className="text-body-md font-body-md text-error mb-4">{loadError}</p>
            <button type="button" className="px-6 py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md" onClick={() => setLoadNonce((n) => n + 1)}>Try again</button>
            <Link to="/my-listings" className="ml-3 px-6 py-3 border border-border-subtle rounded-lg font-label-md text-label-md text-primary inline-block">Back to My Listings</Link>
          </div>
        )}
        {isEdit && !loadingProperty && !loadError && forbidden && (
          <div className="max-w-3xl mx-auto py-16 text-center" role="alert">
            <p className="text-headline-md font-headline-md text-primary mb-2">You can’t edit this listing</p>
            <p className="text-body-md font-body-md text-on-surface-variant mb-6">Only the agent who owns a listing can change it.</p>
            <Link to="/my-listings" className="px-6 py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md inline-block">Back to My Listings</Link>
          </div>
        )}
        {isEdit && !loadingProperty && !loadError && !forbidden && propertyStatus && !EDITABLE_STATUSES.includes(propertyStatus) && user?.role !== 'admin' && (
          <div className="max-w-3xl mx-auto py-16 text-center" role="alert">
            <p className="text-headline-md font-headline-md text-primary mb-2">This listing can’t be edited</p>
            <p className="text-body-md font-body-md text-on-surface-variant mb-6">Listings that are {(PROPERTY_STATUS[propertyStatus]?.label || propertyStatus).toLowerCase()} are read-only.</p>
            <Link to="/my-listings" className="px-6 py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md inline-block">Back to My Listings</Link>
          </div>
        )}

        {(!isEdit || (!loadingProperty && !loadError && !forbidden && propertyStatus && (EDITABLE_STATUSES.includes(propertyStatus) || user?.role === 'admin'))) && (
        <>
        {isEdit && (
          <div className="max-w-3xl mx-auto mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-headline-lg font-headline-lg text-primary">Edit listing</h2>
              <span className={`text-label-sm font-label-sm px-3 py-1 rounded-full ${toneClass(PROPERTY_STATUS[propertyStatus]?.tone)}`}>{PROPERTY_STATUS[propertyStatus]?.label || propertyStatus}</span>
            </div>
            {propertyStatus === 'active' && (
              <p className="rounded-lg bg-secondary-container px-4 py-3 text-body-sm font-body-sm text-on-secondary-container" role="note">
                This listing is live. Saving your changes sends it back for review, and it stays hidden from search until an admin approves it again.
              </p>
            )}
            {propertyStatus === 'rejected' && (
              <p className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container whitespace-pre-wrap" role="note">
                <strong>Reviewer feedback:</strong> {rejectionReason || 'No reason was given.'}
              </p>
            )}
            {propertyStatus === 'draft' && <p className="text-body-sm font-body-sm text-on-surface-variant">This is a draft. Submit it for review when it is ready.</p>}
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between relative max-w-3xl mx-auto">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-border-subtle rounded-full -z-10" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-300"
              style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((s) => (
              <button
                type="button"
                className="flex flex-col items-center bg-transparent"
                key={s.number}
                disabled={!isEdit}
                onClick={() => { setStepError(''); setStep(s.number); }}
                aria-current={s.number === step ? 'step' : undefined}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-label-md text-label-md mb-2 transition-colors ${
                    s.number <= step
                      ? 'bg-primary text-on-primary custom-shadow'
                      : 'bg-surface-container-lowest border border-border-subtle text-on-surface-variant'
                  }`}
                >
                  {s.number}
                </div>
                <span className={`font-label-sm text-label-sm ${s.number <= step ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-8 rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}

        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <div>
            <div className="mb-8">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-primary mb-2">
                Basic Info
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Tell us the essentials about your property.
              </p>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-border-subtle p-8 custom-shadow max-w-3xl">
              {stepError && (
                <p className="mb-4 text-body-sm font-body-sm text-error">{stepError}</p>
              )}
              <div className="space-y-6">
                <div>
                  <label className={labelClass} htmlFor="title">Property Title</label>
                  <input
                    className={inputClass}
                    id="title"
                    placeholder="e.g. Modern Minimalist Villa with Ocean View"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <span className={labelClass}>Listing Type</span>
                  <div className="flex bg-surface-container-low rounded-lg p-1 w-fit">
                    <button
                      type="button"
                      className={`px-6 py-2 rounded-md text-label-md font-label-md transition-all ${listingType === 'sale' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'}`}
                      onClick={() => setListingType('sale')}
                    >
                      For Sale
                    </button>
                    <button
                      type="button"
                      className={`px-6 py-2 rounded-md text-label-md font-label-md transition-all ${listingType === 'rent' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'}`}
                      onClick={() => setListingType('rent')}
                    >
                      For Rent
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={labelClass} htmlFor="type">Property Type</label>
                    <select className={`${inputClass} appearance-none`} id="type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                      <option value="">Select type</option>
                      {propertyTypes.map((pt) => (
                        <option key={pt.type_id} value={pt.type_id}>{pt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="price">Price (USD)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 font-body-md text-body-md text-on-surface-variant">$</span>
                      <input
                        className={`${inputClass} pl-8`}
                        id="price"
                        placeholder="0.00"
                        type="number"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className={labelClass} htmlFor="beds">Beds</label>
                    <input className={inputClass} id="beds" min="0" type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="baths">Baths</label>
                    <input className={inputClass} id="baths" min="0" step="0.5" type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sqft">Sq. Ft.</label>
                    <input className={inputClass} id="sqft" min="0" type="number" value={areaSqft} onChange={(e) => setAreaSqft(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Details & Photos */}
        {step === 2 && (
          <div>
            <div className="mb-8">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-primary mb-2">
                Property Details &amp; Photos
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Upload high-quality images and provide accurate details to attract potential buyers.
              </p>
            </div>
            {stepError && (
              <p className="mb-4 text-body-sm font-body-sm text-error">{stepError}</p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
              {/* Left Content: Drag & Drop Photos */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <label
                  className={`bg-surface-container-lowest rounded-xl border border-border-subtle p-6 flex flex-col items-center justify-center min-h-80 custom-shadow hover:border-primary transition-colors cursor-pointer border-dashed border-2 group ${dragActive ? 'border-primary bg-surface-container-low' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-4 group-hover:text-primary transition-colors">
                    cloud_upload
                  </span>
                  <p className="font-body-md text-body-md font-medium text-primary mb-1">
                    Drag &amp; drop photos here
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                    or click to browse from your device
                  </p>
                  <span className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity">
                    Select Files
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </label>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Supported formats: JPG, PNG, WebP, GIF. Max size: 5 MB per file, up to {MAX_IMAGES} photos. High-resolution horizontal photos recommended.
                </p>
                {uploadWarnings.length > 0 && (
                  <ul className="text-label-sm font-label-sm text-error space-y-1" role="alert">
                    {uploadWarnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                {targetId && existingImages.length > 0 && (
                  <div>
                    <p className="font-label-md text-label-md text-primary mb-2">Current photos</p>
                    <div className="grid grid-cols-3 gap-3">
                      {existingImages.map((img) => (
                        <div key={img.image_id} className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle group" data-image-id={img.image_id}>
                          <img className="w-full h-full object-cover" src={img.image_url} alt="" />
                          {img.is_primary && <span className="absolute top-1 left-1 bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded">Main</span>}
                          <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-black/50">
                            {!img.is_primary && (
                              <button type="button" disabled={imageBusyId !== null} onClick={() => handleMakePrimary(img)} className="flex-1 min-h-[28px] text-[11px] text-white rounded bg-white/20 hover:bg-white/30 disabled:opacity-50">Make main</button>
                            )}
                            <button type="button" disabled={imageBusyId !== null} onClick={() => handleRemoveExistingImage(img)} aria-label="Remove photo" className="flex-1 min-h-[28px] text-[11px] text-white rounded bg-error/80 hover:bg-error disabled:opacity-50">{imageBusyId === img.image_id ? '…' : 'Remove'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {imagePreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {imagePreviews.map((src, i) => (
                      <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle">
                        <img className="w-full h-full object-cover" src={src} alt={`Upload ${i + 1}`} />
                        <button
                          type="button"
                          className="absolute top-1 right-1 w-6 h-6 bg-surface-container-lowest/90 rounded-full flex items-center justify-center text-error"
                          onClick={() => removeImage(i)}
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Right Form: Property Details */}
              <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-border-subtle p-8 custom-shadow">
                <div className="space-y-6">
                  <div>
                    <label className={labelClass} htmlFor="location">Location / Address</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4">
                        <span className="material-symbols-outlined text-on-surface-variant text-xl">location_on</span>
                      </span>
                      <input
                        className={`${inputClass} pl-12`}
                        id="location"
                        placeholder="Street address"
                        type="text"
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass} htmlFor="city">City</label>
                      <input className={inputClass} id="city" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="neighborhood">Neighborhood (optional)</label>
                      <input className={inputClass} id="neighborhood" type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="country">Country</label>
                    <input className={inputClass} id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="latitude">
                      Map coordinates (optional)
                    </label>
                    <p className="text-body-sm font-body-sm text-on-surface-variant mb-2">
                      Adding coordinates shows a real map on the listing page instead of just the
                      address text. Find them by right-clicking the location in Google Maps and
                      copying the two numbers shown, or leave blank.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <input
                        className={inputClass}
                        id="latitude"
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        placeholder="Latitude, e.g. 33.6844"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                      />
                      <input
                        className={inputClass}
                        id="longitude"
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        placeholder="Longitude, e.g. 73.0479"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="description">Property Description</label>
                    <textarea
                      className={`${inputClass} resize-none`}
                      id="description"
                      placeholder="Describe the key features, neighborhood, and unique selling points…"
                      rows="5"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Amenities */}
        {step === 3 && (
          <div>
            <div className="mb-8">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-primary mb-2">
                Amenities
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Select everything that applies to this property.
              </p>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-border-subtle p-8 custom-shadow max-w-3xl">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {amenityList.map((amenity) => {
                  const checked = selectedAmenityIds.includes(amenity.amenity_id);
                  return (
                    <button
                      type="button"
                      key={amenity.amenity_id}
                      onClick={() => toggleAmenity(amenity.amenity_id)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-label-md font-label-md transition-colors text-left ${
                        checked ? 'border-primary bg-surface-container-low text-primary' : 'border-border-subtle text-on-surface-variant hover:border-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {amenity.icon || 'check_circle'}
                      </span>
                      {amenity.name}
                    </button>
                  );
                })}
                {amenityList.length === 0 && (
                  <p className="col-span-full text-body-sm font-body-sm text-on-surface-variant">Loading amenities…</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 4 && (
          <div>
            <div className="mb-8">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-primary mb-2">
                Review Your Listing
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Double-check everything before you submit.
              </p>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-border-subtle p-8 custom-shadow max-w-3xl space-y-6">
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {imagePreviews.map((src, i) => (
                    <img key={src} className="aspect-square object-cover rounded-lg border border-border-subtle" src={src} alt={`Upload ${i + 1}`} />
                  ))}
                </div>
              )}
              <div>
                <h2 className="text-headline-md font-headline-md text-primary">{title || 'Untitled property'}</h2>
                <p className="text-body-md font-body-md text-on-surface-variant capitalize">
                  {selectedType?.name || 'Type not selected'} · For {listingType}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body-sm font-body-sm">
                <div>
                  <span className="text-on-surface-variant block">Price</span>
                  <span className="text-primary font-label-md font-medium">${Number(price || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block">Beds</span>
                  <span className="text-primary font-label-md font-medium">{bedrooms || '—'}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block">Baths</span>
                  <span className="text-primary font-label-md font-medium">{bathrooms || '—'}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block">Sq. Ft.</span>
                  <span className="text-primary font-label-md font-medium">{areaSqft || '—'}</span>
                </div>
              </div>
              <div>
                <span className="text-on-surface-variant text-body-sm font-body-sm block mb-1">Location</span>
                <p className="text-body-md font-body-md text-primary">
                  {[addressLine, neighborhood, city, country].filter(Boolean).join(', ') || 'Not provided'}
                </p>
                <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                  {latitude !== '' && longitude !== ''
                    ? 'Map coordinates added — a map will show on the listing page.'
                    : 'No map coordinates added — the listing page will show the address as text only.'}
                </p>
              </div>
              {description && (
                <div>
                  <span className="text-on-surface-variant text-body-sm font-body-sm block mb-1">Description</span>
                  <p className="text-body-md font-body-md text-on-surface whitespace-pre-line">{description}</p>
                </div>
              )}
              {selectedAmenityIds.length > 0 && (
                <div>
                  <span className="text-on-surface-variant text-body-sm font-body-sm block mb-2">Amenities</span>
                  <div className="flex flex-wrap gap-2">
                    {amenityList
                      .filter((a) => selectedAmenityIds.includes(a.amenity_id))
                      .map((a) => (
                        <span key={a.amenity_id} className="bg-surface-container-low text-primary text-label-sm font-label-sm px-3 py-1 rounded-full">
                          {a.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Action Bar */}
        <div className="mt-12 pt-6 border-t border-border-subtle flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
          {(() => {
            // Edit mode: a live/pending listing has a single save action; drafts and rejected listings can be saved or submitted.
            const editing = Boolean(targetId);
            const canSaveWithoutSubmit = !editing || propertyStatus === 'draft' || propertyStatus === 'rejected' || (editing && !isEdit);
            const submitLabel = !editing
              ? 'Submit for Review'
              : propertyStatus === 'rejected'
                ? 'Resubmit for Review'
                : propertyStatus === 'draft'
                  ? 'Submit for Review'
                  : propertyStatus === 'active'
                    ? 'Save & Send for Review'
                    : 'Save Changes';
            return (
              <>
                {canSaveWithoutSubmit ? (
                  <button
                    className="w-full sm:w-auto px-6 py-3 border border-border-subtle text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-container-low transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    type="button"
                    disabled={submitting}
                    onClick={() => submitProperty(true)}
                  >
                    {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Save Draft'}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                  {step > 1 && (
                    <button
                      className="w-full sm:w-auto px-6 py-3 border border-border-subtle text-on-surface-variant rounded-lg font-label-md text-label-md hover:bg-surface-container-low transition-colors"
                      type="button"
                      onClick={goBack}
                    >
                      Back
                    </button>
                  )}
                  {step < 4 && (
                    <button
                      className={`w-full sm:w-auto px-8 py-3 rounded-lg font-label-md text-label-md transition-opacity flex items-center justify-center gap-2 ${
                        isEdit ? 'border border-border-subtle text-primary hover:bg-surface-container-low' : 'bg-primary text-on-primary hover:opacity-90 custom-shadow'
                      }`}
                      type="button"
                      onClick={goNext}
                    >
                      Next: {STEPS[step].label}
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </button>
                  )}
                  {(step === 4 || isEdit) && (
                    <button
                      className="w-full sm:w-auto px-8 py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2 custom-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                      type="button"
                      disabled={submitting}
                      onClick={() => submitProperty(false)}
                    >
                      {submitting ? 'Submitting…' : submitLabel}
                      <span className="material-symbols-outlined text-lg">check_circle</span>
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
        </>
        )}
      </main>
    </>
  );
}