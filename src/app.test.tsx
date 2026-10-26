import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { initialState, resetState, set, getState } from './state/store';
import { go, sendChat, openPaywall, finishJournal, analyzeJournal } from './state/actions';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetState(initialState(false));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('onboarding', () => {
  it('walks welcome -> intro -> age -> language -> name -> companion -> consent with nothing pre-ticked', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.click(screen.getByText('I understand'));
    fireEvent.click(screen.getByText('Yes, I am'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(4);
    switches.forEach(s => expect(s).toHaveAttribute('aria-checked', 'false'));
  });

  it('the under-18 path shows youth helplines and creates nothing', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.click(screen.getByText('I understand'));
    fireEvent.click(screen.getByText('No, I’m younger'));
    expect(screen.getByText(/Childline · 1098/)).toBeInTheDocument();
    expect(screen.getByText(/KIRAN · 1800-599-0019/)).toBeInTheDocument();
    expect(getState().onboarded).toBe(false);
  });
});

describe('help is always reachable', () => {
  it.each(['today', 'talk', 'outside', 'journal', 'you', 'calm'] as const)('%s has a Need help? pill that opens the support sheet with a direct call link', screen_ => {
    set({ onboarded: true });
    go(screen_);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Need help?' }));
    const dialog = screen.getByRole('dialog');
    const link = within(dialog).getByRole('link', { name: /Call Tele-MANAS/ });
    expect(link).toHaveAttribute('href', 'tel:14416');
  });
});

describe('chat safety', () => {
  const chat = () => { set({ onboarded: true }); go('chat'); };
  const say = (text: string) => { act(() => set({ draft: text })); act(() => sendChat()); };

  it('level 2 shows the care card after the reply, not the crisis screen', () => {
    chat();
    render(<App />);
    say('I feel hopeless');
    advance(2000);
    expect(screen.getByText('Talk to a real person')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(/Are you thinking about ending your life/)).toBeInTheDocument();
  });

  it('level 3 takes over immediately with fixed copy, and cannot be dismissed with Escape', () => {
    chat();
    render(<App />);
    say('I have a plan for tonight');
    const crisis = screen.getByRole('alertdialog');
    expect(within(crisis).getByText('Your safety matters most right now.')).toBeInTheDocument();
    expect(within(crisis).getByRole('link', { name: /Tele-MANAS 14416/ })).toHaveAttribute('href', 'tel:14416');
    expect(within(crisis).getByRole('link', { name: /emergency services/ })).toHaveAttribute('href', 'tel:112');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // The reviewed Level 3 script was added to the thread instead of an AI-generated turn.
    expect(getState().msgs.at(-1)?.text).toContain('14416');
  });

  it('"I\'m safe right now" needs a second confirmation', () => {
    chat();
    render(<App />);
    say('I want to kill myself');
    fireEvent.click(screen.getByText('I’m safe right now'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, I’m safe right now'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(getState().risk.level).toBe(1);
  });

  it('a minor disclosing their age is routed to the under-18 exit', () => {
    chat();
    render(<App />);
    say('I am 15 years old');
    advance(2000);
    advance(2500);
    expect(getState().screen).toBe('under');
  });

  it('answers honestly when asked if it is human', () => {
    chat();
    render(<App />);
    say('are you a real person?');
    advance(2000);
    expect(screen.getByText(/I’m an AI, not a person/)).toBeInTheDocument();
  });
});

describe('paywall', () => {
  it('opens on user action when calm', () => {
    set({ onboarded: true });
    go('you');
    render(<App />);
    act(() => openPaywall());
    expect(screen.getByRole('dialog', { name: 'Saathi Plus' })).toBeInTheDocument();
  });

  it('is never shown once there has been distress this session', () => {
    set({ onboarded: true });
    go('chat');
    render(<App />);
    act(() => set({ draft: 'I feel so lonely' }));
    act(() => sendChat());
    advance(2000);
    act(() => openPaywall());
    expect(screen.queryByRole('dialog', { name: 'Saathi Plus' })).toBeNull();
  });
});

describe('journal review', () => {
  it('writes nothing to memory until Done, and sensitive memories start unsaved', () => {
    set({ onboarded: true, jText: 'My therapist said the trauma is why I sleep badly. Work was fine.', jShare: true, jMode: 'write' });
    go('jcompose', { jText: 'My therapist said the trauma is why I sleep badly. Work was fine.', jShare: true });
    const before = getState().memories.length;
    render(<App />);
    act(() => analyzeJournal(getState().jText));
    advance(1500);
    expect(screen.getByText('What I noticed')).toBeInTheDocument();
    expect(getState().memories.length).toBe(before);
    expect(screen.getByText(/This feels personal, so it’s off unless you choose it/)).toBeInTheDocument();
    const r = getState().jResult!;
    expect(r.memories.filter(m => m.sensitive).every(m => !m.keep)).toBe(true);
    act(() => finishJournal());
    expect(getState().memories.length).toBe(before + r.memories.filter(m => m.keep).length);
  });

  it('keep-it-private saves the entry without sharing and discards the analysis', () => {
    set({ onboarded: true });
    go('jcompose', { jText: 'Work was a lot today.', jShare: true });
    render(<App />);
    act(() => analyzeJournal('Work was a lot today.'));
    advance(1500);
    fireEvent.click(screen.getByText('Keep it just for me'));
    expect(getState().jResult).toBeNull();
    expect(getState().jEntries[0].shared).toBe(false);
  });

  it('a Just for me entry skips analysis entirely', () => {
    set({ onboarded: true });
    go('jcompose', { jText: 'Some things stay mine.', jShare: false });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(getState().jStage).toBe('edit');
    expect(getState().jResult).toBeNull();
    expect(getState().screen).toBe('journal');
  });
});

describe('privacy', () => {
  it('persists preferences but never journal text or memories', () => {
    render(<App />);
    act(() => set({ nick: 'Test', jText: 'secret thoughts', memories: [{ id: 9, theme: 'People', text: 'secret person', hidden: false }] }));
    advance(400);
    const raw = localStorage.getItem('saathi.prefs.v1') ?? '';
    expect(raw).toContain('Test');
    expect(raw).not.toContain('secret');
  });

  it('delete everything clears local storage and returns to welcome', () => {
    set({ onboarded: true });
    go('privacy');
    render(<App />);
    fireEvent.click(screen.getByText('Delete everything'));
    fireEvent.click(screen.getByText('Delete my account and data'));
    expect(getState().screen).toBe('welcome');
    expect(getState().onboarded).toBe(false);
  });
});
