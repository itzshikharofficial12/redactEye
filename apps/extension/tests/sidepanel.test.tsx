import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../src/entrypoints/sidepanel/App';

describe('RedactEye Side Panel UI', () => {
  let fetchSpy: any;

  beforeEach(() => {
    // Spy on global fetch to ensure no network calls are made
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header with RedactEye title and status', () => {
    render(<App />);
    expect(screen.getByText('RedactEye')).toBeDefined();
    expect(screen.getByText('Private browser agent')).toBeDefined();
    expect(screen.getByLabelText('Status: Ready')).toBeDefined();
    expect(screen.getByLabelText('Extension options')).toBeDefined();
  });

  it('renders the empty state and suggested tasks in idle state', () => {
    render(<App />);
    expect(screen.getByText('What can I help with?')).toBeDefined();
    expect(screen.getByText('Find the login button')).toBeDefined();
    expect(screen.getByText('Summarize this page')).toBeDefined();
    expect(screen.getByText('Fill out this form')).toBeDefined();
  });

  it('renders privacy status indicating engine is not connected yet', () => {
    render(<App />);
    expect(screen.getByText('Protected locally')).toBeDefined();
    expect(screen.getByText('Privacy engine not connected')).toBeDefined();
  });

  it('renders composer input and handles typing', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ask RedactEye...') as HTMLInputElement;
    const submitBtn = screen.getByTitle('Submit task') as HTMLButtonElement;

    // Disabled initially when empty
    expect(submitBtn.disabled).toBe(true);

    // Type into composer
    fireEvent.change(input, { target: { value: 'Inspect the navigation bar' } });
    expect(input.value).toBe('Inspect the navigation bar');
    expect(submitBtn.disabled).toBe(false);
  });

  it('handles composer submission and displays local placeholder state without network calls', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ask RedactEye...');
    const submitBtn = screen.getByTitle('Submit task');

    fireEvent.change(input, { target: { value: 'Find the pricing section' } });
    fireEvent.click(submitBtn);

    // Check placeholder UI state
    expect(screen.getByText('Active Task')).toBeDefined();
    expect(screen.getByText('Find the pricing section')).toBeDefined();
    expect(screen.getByText('Agent connection coming next.')).toBeDefined();

    // Verify reset capability
    const resetBtn = screen.getByRole('button', { name: /start new task/i });
    fireEvent.click(resetBtn);
    expect(screen.getByText('What can I help with?')).toBeDefined();

    // Crucial check: zero network calls made
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles keyboard Enter submission in composer', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ask RedactEye...');

    fireEvent.change(input, { target: { value: 'Click the checkout button' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('Click the checkout button')).toBeDefined();
    expect(screen.getByText('Agent connection coming next.')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clicking a suggested task sets placeholder state without network calls', () => {
    render(<App />);
    const suggestionBtn = screen.getByText('Find the login button');
    fireEvent.click(suggestionBtn);

    expect(screen.getByText('Active Task')).toBeDefined();
    expect(screen.getByText('Find the login button')).toBeDefined();
    expect(screen.getByText('Agent connection coming next.')).toBeDefined();

    // Crucial check: zero network calls made
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
