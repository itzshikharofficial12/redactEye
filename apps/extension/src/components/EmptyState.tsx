import React from 'react';

export const EmptyState: React.FC = () => {
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="empty-state">
      <h1 className="empty-state-greeting">{getGreeting()}</h1>
      <p className="empty-state-prompt">What can I help with?</p>
    </div>
  );
};
