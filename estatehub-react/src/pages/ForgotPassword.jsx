// src/pages/ForgotPassword.jsx
// Matches SignIn.jsx's split-screen layout. Always shows the same generic success message,
// regardless of whether the email belongs to an account — the backend guarantees this too
// (see auth.controller.js#forgotPassword), so there is nothing here to accidentally leak.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/apiClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      // Network/validation errors only — the backend never returns an error that reveals whether
      // the email exists, so this branch is genuinely about "something went wrong", not about
      // the account.
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-grow flex w-full min-h-screen">
      <div className="w-full flex">
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
            <p className="text-headline-lg font-headline-lg mb-4 text-on-primary">Forgot your password?</p>
            <p className="text-body-lg font-body-lg max-w-md text-on-primary opacity-90">
              No problem — we'll send you a link to get back into your account.
            </p>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-24 bg-surface-container-lowest relative">
          <div className="absolute top-8 left-8 lg:hidden">
            <span className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">EstateHub</span>
          </div>

          <div className="w-full max-w-md space-y-8">
            {submitted ? (
              <div className="space-y-6">
                <div>
                  <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">Check your email</h1>
                  <p className="text-body-md font-body-md text-on-surface-variant" role="status">
                    If an account exists for <span className="font-medium text-on-surface">{email}</span>, password reset
                    instructions have been sent. The link will expire in 30 minutes.
                  </p>
                </div>
                <Link
                  to="/sign-in"
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background transition-all duration-200"
                >
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">Forgot your password?</h1>
                  <p className="text-body-md font-body-md text-on-surface-variant">
                    Enter the email address on your account and we'll send you a reset link.
                  </p>
                </div>
                {error && (
                  <div className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">
                    {error}
                  </div>
                )}
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface-variant mb-2" htmlFor="email">
                      Email address
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                        <span className="material-symbols-outlined text-on-surface-variant">mail</span>
                      </span>
                      <input
                        className="block w-full pl-10 pr-3 py-3 border border-border-subtle rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-surface-container-lowest text-on-surface transition-colors duration-200"
                        id="email"
                        name="email"
                        placeholder="name@example.com"
                        required
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
                <p className="text-center text-body-sm font-body-sm text-on-surface-variant">
                  Remembered your password?{' '}
                  <Link className="font-medium text-primary hover:text-secondary-fixed-variant transition-colors duration-200" to="/sign-in">
                    Sign In
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
