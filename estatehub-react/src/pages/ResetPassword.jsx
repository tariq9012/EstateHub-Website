// src/pages/ResetPassword.jsx
// Reads ?token= from the URL. There's no backend endpoint to pre-validate a token before submit
// (adding one would itself be a small oracle — "is this token valid?" — for no real benefit), so
// "invalid/expired" is detected either immediately (no token in the URL at all) or from the 400
// the backend returns on submit.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/apiClient';

const MIN_LENGTH = 8;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const inputClass =
    'block w-full pl-10 pr-10 py-3 border border-border-subtle rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-surface-container-lowest text-on-surface transition-colors duration-200';
  const labelClass = 'block text-label-md font-label-md text-on-surface-variant mb-2';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters long.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setSucceeded(true);
    } catch (err) {
      setError(err.message || 'This password reset link is invalid or has expired. Please request a new one.');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children) => (
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
            <p className="text-headline-lg font-headline-lg mb-4 text-on-primary">Choose a new password</p>
            <p className="text-body-lg font-body-lg max-w-md text-on-primary opacity-90">
              Make it something secure that you haven't used before.
            </p>
          </div>
        </div>
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-24 bg-surface-container-lowest relative">
          <div className="absolute top-8 left-8 lg:hidden">
            <span className="text-headline-md font-headline-md font-extrabold tracking-tight text-primary">EstateHub</span>
          </div>
          <div className="w-full max-w-md space-y-8">{children}</div>
        </div>
      </div>
    </main>
  );

  if (!token) {
    return shell(
      <div className="space-y-6">
        <div>
          <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">Invalid reset link</h1>
          <p className="text-body-md font-body-md text-on-surface-variant" role="alert">
            This password reset link is missing its token. Please request a new one.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background transition-all duration-200"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (succeeded) {
    return shell(
      <div className="space-y-6">
        <div>
          <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">Password reset</h1>
          <p className="text-body-md font-body-md text-on-surface-variant" role="status">
            Your password has been changed. You can now sign in with your new password.
          </p>
        </div>
        <Link
          to="/sign-in"
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background transition-all duration-200"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return shell(
    <>
      <div>
        <h1 className="text-headline-lg font-headline-lg-mobile md:font-headline-lg text-primary mb-2">Set a new password</h1>
        <p className="text-body-md font-body-md text-on-surface-variant">Choose a new password for your EstateHub account.</p>
      </div>
      {error && (
        <div className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-body-sm text-on-error-container" role="alert">
          {error}{' '}
          <Link to="/forgot-password" className="underline font-medium">Request a new link</Link>
        </div>
      )}
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
          <label className={labelClass} htmlFor="newPassword">New password</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
              <span className="material-symbols-outlined text-on-surface-variant">lock</span>
            </span>
            <input
              id="newPassword"
              className={inputClass}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              required
              minLength={MIN_LENGTH}
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
          <p id="password-requirements" className="text-label-sm font-label-sm text-on-surface-variant mt-1">
            At least {MIN_LENGTH} characters.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="confirmPassword">Confirm new password</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
              <span className="material-symbols-outlined text-on-surface-variant">lock</span>
            </span>
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
        <button
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-label-md font-label-md text-on-primary bg-primary hover:bg-on-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </>
  );
}
