import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('buyer');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (role === 'agent' && !licenseNumber.trim()) {
      setError('License number is required to register as an agent.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { firstName, lastName, email, phone, password, role };
      if (role === 'agent') {
        payload.licenseNumber = licenseNumber;
        if (agencyName) payload.agencyName = agencyName;
        if (specialty) payload.specialty = specialty;
        if (yearsExperience) payload.yearsExperience = Number(yearsExperience);
      }

      const user = await register(payload);
      navigate(user.role === 'agent' ? '/agent-profile' : '/user-dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'block w-full px-3 py-3 border border-border-subtle rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-surface-container-lowest text-on-surface transition-colors duration-200';
  const labelClass = 'block text-label-md font-label-md text-on-surface-variant mb-2';

  return (
    <main className="flex-grow flex w-full min-h-screen">
      <div className="w-full flex">
        {/* Left Side: Image (matches SignIn's split-screen pattern) */}
        <div className="hidden lg:block lg:w-1/2 relative bg-surface-container">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #2b2320 0%, #5b4438 40%, #b5794f 75%, #f0c48a 100%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary-container/80 to-transparent" />
          <div className="absolute bottom-12 left-12 text-on-primary">
            <p className="text-headline-lg font-headline-lg mb-4 text-on-primary">Join EstateHub</p>
            <p className="text-body-lg font-body-lg max-w-md text-on-primary opacity-90">
              Create an account to save favorites, message agents, and list your own properties.
            </p>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-16 bg-surface-container-lowest relative">
          <div className="absolute top-8 left-8 lg:hidden">
            <span className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">
              EstateHub
            </span>
          </div>

          <div className="w-full max-w-md space-y-6 py-16 lg:py-0">
            <div>
              <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">
                Create your account
              </h1>
              <p className="text-body-md font-body-md text-on-surface-variant">
                Buying, selling, or both — set up your EstateHub profile.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">
                {error}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Role toggle */}
              <div>
                <span className={labelClass}>I am a</span>
                <div className="flex bg-surface-container-low rounded-lg p-1">
                  <button
                    type="button"
                    className={`flex-1 px-4 py-2 rounded-md text-label-md font-label-md transition-all ${
                      role === 'buyer' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'
                    }`}
                    onClick={() => setRole('buyer')}
                  >
                    Buyer
                  </button>
                  <button
                    type="button"
                    className={`flex-1 px-4 py-2 rounded-md text-label-md font-label-md transition-all ${
                      role === 'agent' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'
                    }`}
                    onClick={() => setRole('agent')}
                  >
                    Agent
                  </button>
                </div>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="firstName">First name</label>
                  <input
                    id="firstName"
                    className={inputClass}
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="lastName">Last name</label>
                  <input
                    id="lastName"
                    className={inputClass}
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className={labelClass} htmlFor="email">Email address</label>
                <input
                  id="email"
                  className={inputClass}
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Phone (optional) */}
              <div>
                <label className={labelClass} htmlFor="phone">Phone (optional)</label>
                <input
                  id="phone"
                  className={inputClass}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      className={`${inputClass} pr-10`}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby="password-requirements"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-primary focus:outline-none transition-colors duration-200"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  <p id="password-requirements" className="text-label-sm font-label-sm text-on-surface-variant mt-1">At least 8 characters.</p>
                </div>
                <div>
                  <label className={labelClass} htmlFor="confirmPassword">Confirm password</label>
                  <input
                    id="confirmPassword"
                    className={inputClass}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Agent-only fields */}
              {role === 'agent' && (
                <div className="space-y-5 border-t border-border-subtle pt-5">
                  <div>
                    <label className={labelClass} htmlFor="licenseNumber">License number</label>
                    <input
                      id="licenseNumber"
                      className={inputClass}
                      type="text"
                      required={role === 'agent'}
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass} htmlFor="agencyName">Agency (optional)</label>
                      <input
                        id="agencyName"
                        className={inputClass}
                        type="text"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="specialty">Specialty (optional)</label>
                      <input
                        id="specialty"
                        className={inputClass}
                        type="text"
                        placeholder="Residential"
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="yearsExperience">Years of experience (optional)</label>
                    <input
                      id="yearsExperience"
                      className={inputClass}
                      type="number"
                      min="0"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="text-center text-body-sm font-body-sm text-on-surface-variant">
              Already have an account?{' '}
              <Link className="font-medium text-primary hover:text-secondary-fixed-variant transition-colors duration-200" to="/sign-in">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}