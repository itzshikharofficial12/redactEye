import React from 'react';

export const PrivacyStatus: React.FC = () => {
  return (
    <div className="privacy-status" role="status" aria-live="polite">
      {/* Lock SVG Icon */}
      <svg
        className="privacy-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <div className="privacy-content">
        <span className="privacy-primary">Protected locally</span>
        <span className="privacy-secondary">Privacy engine not connected</span>
      </div>
    </div>
  );
};
