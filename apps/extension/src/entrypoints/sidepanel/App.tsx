import React, { useState } from 'react';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { TaskSuggestions } from '../../components/TaskSuggestions';
import { PrivacyStatus } from '../../components/PrivacyStatus';
import { Composer } from '../../components/Composer';

export type PanelState = 'idle' | 'composing' | 'submitted-placeholder';

export const App: React.FC = () => {
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [inputValue, setInputValue] = useState('');
  const [submittedTask, setSubmittedTask] = useState<string | null>(null);

  const handleInputChange = (text: string) => {
    setInputValue(text);
    if (panelState !== 'submitted-placeholder') {
      setPanelState(text.trim().length > 0 ? 'composing' : 'idle');
    }
  };

  const handleTaskSubmit = (task: string) => {
    if (!task.trim()) return;
    setSubmittedTask(task.trim());
    setInputValue('');
    setPanelState('submitted-placeholder');
  };

  const handleReset = () => {
    setSubmittedTask(null);
    setInputValue('');
    setPanelState('idle');
  };

  return (
    <div className="app-container">
      <Header />

      <main className="app-main">
        {panelState !== 'submitted-placeholder' ? (
          <>
            <EmptyState />
            <TaskSuggestions onSelectSuggestion={handleTaskSubmit} />
          </>
        ) : (
          <div className="submitted-card" role="region" aria-label="Submitted task placeholder">
            <span className="submitted-task-label">Active Task</span>
            <div className="submitted-task-text">{submittedTask}</div>
            <p className="submitted-placeholder-msg">
              Agent connection coming next.
            </p>
            <button
              type="button"
              className="submitted-reset-btn"
              onClick={handleReset}
            >
              Start new task
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <PrivacyStatus />
        <Composer
          value={inputValue}
          onChange={handleInputChange}
          onSubmit={handleTaskSubmit}
        />
      </footer>
    </div>
  );
};

export default App;
