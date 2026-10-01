import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SignIn() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const redirectTo = location.state?.from?.pathname;
      if (redirectTo) {
        navigate(redirectTo, { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin-dashboard', { replace: true });
      } else if (user.role === 'agent') {
        navigate('/agent-dashboard', { replace: true });
      } else {
        navigate('/user-dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
{/* TopNavBar is suppressed as this is a transactional Login page according to the Semantic Shell Mandate */}
<main className="flex-grow flex w-full">
  {/* Split Screen Layout */}
  <div className="w-full flex">
    {/* Left Side: Image (Hidden on mobile) */}
    <div className="hidden lg:block lg:w-1/2 relative bg-surface-container">
      <div className="absolute inset-0 bg-cover bg-center" data-alt="A breathtaking, high-resolution interior view of a modern luxury penthouse apartment living room. Floor-to-ceiling windows reveal a stunning sunset cityscape. The room features elegant minimalist furniture, warm ambient lighting, and subtle architectural details in white and soft gray, perfectly reflecting the brand's premium, modern minimalist aesthetic." style={{backgroundImage: "linear-gradient(135deg, #2b2320 0%, #5b4438 40%, #b5794f 75%, #f0c48a 100%)"}}>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-primary-container/80 to-transparent">
      </div>
      <div className="absolute bottom-12 left-12 text-on-primary">
        <p className="text-headline-lg font-headline-lg mb-4 text-on-primary">
          Find Your Masterpiece
        </p>
        <p className="text-body-lg font-body-lg max-w-md text-on-primary opacity-90">
          Curated properties for the discerning buyer. Join EstateHub to access exclusive listings and market insights.
        </p>
      </div>
    </div>
    {/* Right Side: Form */}
    <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-24 bg-surface-container-lowest relative">
      {/* Brand Logo (Floating top left on mobile/tablet) */}
      <div className="absolute top-8 left-8 lg:hidden">
        <span className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">
          EstateHub
        </span>
      </div>
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">
            Welcome back to EstateHub
          </h1>
          <p className="text-body-md font-body-md text-on-surface-variant">
            Please enter your details to sign in.
          </p>
        </div>
        {error && (
          <div className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}
        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Email Input */}
          <div>
            <label className="block text-label-md font-label-md text-on-surface-variant mb-2" htmlFor="email">
              Email address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                <span className="material-symbols-outlined text-on-surface-variant">
                  mail
                </span>
              </span>
              <input className="block w-full pl-10 pr-3 py-3 border border-border-subtle rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-surface-container-lowest text-on-surface transition-colors duration-200" id="email" name="email" placeholder="name@example.com" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {/* Password Input */}
          <div>
            <label className="block text-label-md font-label-md text-on-surface-variant mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                <span className="material-symbols-outlined text-on-surface-variant">
                  lock
                </span>
              </span>
              <input className="block w-full pl-10 pr-10 py-3 border border-border-subtle rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-surface-container-lowest text-on-surface transition-colors duration-200" id="password" name="password" placeholder="••••••••" required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-primary focus:outline-none transition-colors duration-200" onClick={() => setShowPassword((v) => !v)} type="button">
                <span className="material-symbols-outlined" id="visibility-icon">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>
          {/* Form Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input className="h-4 w-4 text-primary focus:ring-primary border-border-subtle rounded" id="remember-me" name="remember-me" type="checkbox" />
              <label className="ml-2 block text-body-sm font-body-sm text-on-surface-variant" htmlFor="remember-me">
                Remember me
              </label>
            </div>
            <div className="text-body-sm font-body-sm">
              <Link className="font-medium text-primary hover:text-secondary-fixed-variant transition-colors duration-200" to="/forgot-password">
                Forgot your password?
              </Link>
            </div>
          </div>
          {/* Submit Button */}
          <div>
            <button className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed" type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
        {/*
          "Continue with Google" was removed here rather than kept as a decorative button that
          simulates a login it can't actually perform (see the Auth Hardening phase audit — no
          Google client ID/secret or backend verification route existed). To implement it for
          real: add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, a POST /api/auth/google route that
          verifies the ID token server-side with Google (never trusting a frontend-supplied email),
          and explicit existing-account-linking rules — a Google login must never create or
          escalate to an admin account. (Those variables are intentionally NOT in .env.example
          because the feature does not exist; add them alongside the backend route.)
        */}
        {/* Footer / Sign Up Link */}
        <p className="mt-8 text-center text-body-sm font-body-sm text-on-surface-variant">
          Don't have an account?
          <Link className="font-medium text-primary hover:text-secondary-fixed-variant transition-colors duration-200" to="/register">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  </div>
</main>
    </>
  );
}