// src/components/messages/Avatar.jsx
// Round avatar: image when available (falls back to initials if it fails to load).

import { useEffect, useState } from 'react';
import { getInitials } from './messageUtils';

const SIZES = {
  sm: 'w-8 h-8 text-label-sm font-label-sm',
  md: 'w-11 h-11 text-label-md font-label-md',
};

export default function Avatar({ firstName, lastName, src, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  return (
    <div
      className={`${SIZES[size]} flex-shrink-0 rounded-full bg-surface-container-high text-primary overflow-hidden flex items-center justify-center border border-border-subtle`}
      aria-hidden="true"
    >
      {src && !broken ? (
        <img className="w-full h-full object-cover" src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        <span>{getInitials(firstName, lastName)}</span>
      )}
    </div>
  );
}
