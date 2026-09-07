import React from 'react';

interface ComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
}) => {
  const isSubmitDisabled = disabled || !value.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitDisabled) {
        onSubmit(value.trim());
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSubmitDisabled) {
      onSubmit(value.trim());
    }
  };

  return (
    <form className="composer-wrapper" onSubmit={handleSubmit}>
      <input
        type="text"
        className="composer-input"
        placeholder="Ask RedactEye..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Ask RedactEye a task"
      />
      <button
        type="submit"
        className="composer-submit-btn"
        disabled={isSubmitDisabled}
        aria-label="Submit task"
        title="Submit task"
      >
        {/* Upward Arrow SVG */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </form>
  );
};
