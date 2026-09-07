import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-left">
        {/* Eye/Iris SVG Icon */}
        <svg
          className="header-logo-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>

        <div className="header-title-block">
          <div className="header-title-row">
            <span className="header-title">RedactEye</span>
            <span
              className="header-status-dot"
              title="Extension shell ready"
              aria-label="Status: Ready"
            />
          </div>
          <span className="header-subtitle">Private browser agent</span>
        </div>
      </div>

      <button
        type="button"
        className="header-menu-btn"
        aria-label="Extension options"
        title="Options"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </header>
  );
};
