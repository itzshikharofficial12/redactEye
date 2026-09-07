import React from 'react';

interface TaskSuggestionsProps {
  onSelectSuggestion: (task: string) => void;
}

const SUGGESTIONS = [
  'Find the login button',
  'Summarize this page',
  'Fill out this form',
];

export const TaskSuggestions: React.FC<TaskSuggestionsProps> = ({
  onSelectSuggestion,
}) => {
  return (
    <div className="suggestions-container" role="list" aria-label="Suggested tasks">
      {SUGGESTIONS.map((task) => (
        <button
          key={task}
          type="button"
          className="suggestion-item"
          onClick={() => onSelectSuggestion(task)}
        >
          <span>{task}</span>
          <span className="suggestion-arrow" aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  );
};
