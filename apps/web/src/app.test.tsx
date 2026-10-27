import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, isDemo, type VoiceList } from './api';
import { getState, resetState, set } from './state/store';
import { enterApp, go, openChat, openPaywall, sendChat, startJournal } from './state/actions';

// These run against the in-memory DemoApi (VITE_DEMO=1 in vitest config), which follows the same interface and rules
// as the server. The server's own behaviour is covered by the API test suite.

beforeEach(() => {
  localStorage.clear();
  resetState();
});
afterEach(() => { cleanup(); });

const signedIn = async (screen_: Parameters<typeof go>[0] = 'today') => {
  await api.otpVerify({ phone: '9876543210', code: '123456', age18: true, nickname: 'Test' });
  await api.putConsent({ remember: true });
  await api.patchMe({ onboarded: true });
  await enterApp(false);
  go(screen_);
};

describe('demo wiring', () => {
  it('tests run against the demo API, never the network', () => {
    expect(isDemo).toBe(true);
  });
});

describe('onboarding', () => {
  it('walks welcome -> intro -> age -> language -> name -> code -> companion -> consent with nothing pre-ticked', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('Get started'));
    fireEvent.click(screen.getByText('I understand'));
    fireEvent.click(screen.getByText('Yes, I am'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText('What should I call you?'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Your mobile number'), { target: { value: '98765 43210' } });
    fireEvent.click(screen.getByText('Send me a code'));
    const code = await screen.findByLabelText('Enter your code');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Continue'));
    await screen.findByText(/Pick a look|companion/i);
    fireEvent.click(screen.getByText('Continue'));
    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(4);
    switches.forEach(s => expect(s).toHaveAttribute('aria-checked', 'false'));
  });

  it('a wrong code shows an error and does not sign in', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('Get started'));
    fireEvent.click(screen.getByText('I understand'));
    fireEvent.click(screen.getByText('Yes, I am'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText('What should I call you?'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Your mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send me a code'));
    fireEvent.change(await screen.findByLabelText('Enter your code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/code/i);
    expect(getState().phase).not.toBe('in');
  });

  it('the under-18 path shows youth helplines and signs nobody in', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('Get started'));
    fireEvent.click(screen.getByText('I understand'));
    fireEvent.click(screen.getByText('No, I’m younger'));
    expect(screen.getByText(/Childline · 1098/)).toBeInTheDocument();
    expect(screen.getByText(/KIRAN · 1800-599-0019/)).toBeInTheDocument();
    expect(getState().phase).not.toBe('in');
  });
});

describe('help is always reachable', () => {
  it.each(['today', 'talk', 'outside', 'journal', 'you', 'calm'] as const)('%s has a Need help? pill that opens the support sheet with a direct call link', async screen_ => {
    await signedIn(screen_);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Need help?' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /Call Tele-MANAS/ })).toHaveAttribute('href', 'tel:14416');
  });
});

describe('text chat (demo companion)', () => {
  const chat = async () => { await signedIn('today'); await openChat(); };
  const say = (text: string) => { act(() => set({ draft: text })); act(() => sendChat()); };

  it('level 2 shows the care card after the reply, not the crisis screen', async () => {
    await chat();
    render(<App />);
    await waitFor(() => expect(getState().conv?.ready).toBe(true));
    say('I feel hopeless');
    expect(await screen.findByText('Talk to a real person', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('level 3 takes over immediately with fixed copy, and cannot be dismissed with Escape', async () => {
    await chat();
    render(<App />);
    await waitFor(() => expect(getState().conv?.ready).toBe(true));
    say('I have a plan for tonight');
    const crisis = await screen.findByRole('alertdialog');
    expect(within(crisis).getByText('Your safety matters most right now.')).toBeInTheDocument();
    expect(within(crisis).getByRole('link', { name: /Tele-MANAS 14416/ })).toHaveAttribute('href', 'tel:14416');
    expect(within(crisis).getByRole('link', { name: /emergency services/ })).toHaveAttribute('href', 'tel:112');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(getState().msgs.at(-1)?.text).toContain('14416');
  });

  it('"I\'m safe right now" needs a second confirmation', async () => {
    await chat();
    render(<App />);
    await waitFor(() => expect(getState().conv?.ready).toBe(true));
    say('I want to kill myself');
    fireEvent.click(await screen.findByText('I’m safe right now'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, I’m safe right now'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(getState().risk.level).toBe(1);
  });

  it('a minor disclosing their age is signed out and routed to the under-18 exit', async () => {
    await chat();
    render(<App />);
    await waitFor(() => expect(getState().conv?.ready).toBe(true));
    say('I am 15 years old');
    await waitFor(() => expect(getState().screen).toBe('under'), { timeout: 4000 });
    expect(getState().phase).not.toBe('in');
  });
});

describe('paywall', () => {
  it('opens on user action when calm', async () => {
    await signedIn('you');
    render(<App />);
    act(() => openPaywall());
    expect(await screen.findByRole('dialog', { name: 'Saathi Plus' })).toBeInTheDocument();
  });

  it('is never shown once there has been distress this session', async () => {
    await signedIn('today');
    await openChat();
    render(<App />);
    await waitFor(() => expect(getState().conv?.ready).toBe(true));
    act(() => set({ draft: 'I feel so lonely' }));
    act(() => sendChat());
    await waitFor(() => expect(getState().risk.max).toBeGreaterThanOrEqual(1), { timeout: 4000 });
    act(() => openPaywall());
    expect(screen.queryByRole('dialog', { name: 'Saathi Plus' })).toBeNull();
  });
});

describe('journal review', () => {
  const compose = async (text: string, shared: boolean) => {
    await signedIn('today');
    startJournal('write');
    set({ jText: text, jShare: shared });
    render(<App />);
  };

  it('writes nothing to memory until Done, and sensitive memories start unticked', async () => {
    await compose('My therapist said the trauma is why I sleep badly. Work was fine.', true);
    const before = (await api.memories()).length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('What I noticed', {}, { timeout: 4000 })).toBeInTheDocument();
    expect((await api.memories()).length).toBe(before);
    expect(screen.getByText(/This feels personal, so it’s off unless you choose it/)).toBeInTheDocument();
    const r = getState().jResult!;
    expect(r.memories.filter(m => m.sensitive).every(m => !r.keep.includes(m.id))).toBe(true);
    fireEvent.click(screen.getByText('Done'));
    await waitFor(async () => expect((await api.memories()).length).toBe(before + r.keep.length));
  });

  it('keep-it-private saves the entry without sharing and discards the analysis', async () => {
    await compose('Work was a lot today.', true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByText('Keep it just for me', {}, { timeout: 4000 }));
    await waitFor(() => expect(getState().jResult).toBeNull());
    expect(getState().jEntries[0].shared).toBe(false);
  });

  it('a Just for me entry skips analysis entirely', async () => {
    await compose('Some things stay mine.', false);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(getState().screen).toBe('journal'));
    expect(getState().jResult).toBeNull();
  });
});

describe('privacy', () => {
  it('persists display preferences only, never journal text, memories or the phone number', async () => {
    render(<App />);
    act(() => set({ nick: 'Test', phone: '9876543210', jText: 'secret thoughts', reduceMotion: true, memories: [{ id: 'x', theme: 'People', text: 'secret person', sensitive: false, hidden: false, source: 'chat', createdAt: '' }] }));
    await new Promise(r => setTimeout(r, 450));
    const raw = localStorage.getItem('saathi.ui.v1') ?? '';
    expect(raw).toContain('reduceMotion');
    expect(raw).not.toMatch(/secret|Test|9876543210/);
  });

  it('delete everything signs out and returns to welcome', async () => {
    await signedIn('privacy');
    render(<App />);
    fireEvent.click(await screen.findByText('Delete everything'));
    fireEvent.click(screen.getByText('Delete my account and data'));
    fireEvent.click(screen.getByText('Yes, delete my account and data'));
    await waitFor(() => expect(getState().screen).toBe('welcome'));
    expect(getState().phase).not.toBe('in');
  });
});

describe('avatar and voice', () => {
  const NATURAL: VoiceList = { language: 'hi', serverVoices: true, items: [
    { id: 'sarvam:priya', label: 'Priya', gender: 'female', provider: 'sarvam' }, { id: 'sarvam:rahul', label: 'Rahul', gender: 'male', provider: 'sarvam' },
    { id: 'warm', label: 'Warm', gender: null, provider: 'device' }, { id: 'steady', label: 'Steady', gender: null, provider: 'device' }, { id: 'bright', label: 'Bright', gender: null, provider: 'device' },
  ] };
  afterEach(() => { vi.restoreAllMocks(); });

  it('lists the natural voices for the person’s language, and saves the choice straight away', async () => {
    const asked: (string | undefined)[] = [];
    vi.spyOn(api, 'voices').mockImplementation(async l => { asked.push(l); return NATURAL; });
    await signedIn('studio');
    set({ language: 'hi' });
    render(<App />);
    const group = await screen.findByRole('radiogroup', { name: 'Voice' });
    expect(await within(group).findByText('Priya')).toBeInTheDocument();
    expect(within(group).getByText('Woman’s voice')).toBeInTheDocument();
    expect(within(group).getByText('Man’s voice')).toBeInTheDocument();
    expect(asked).toContain('hi');
    fireEvent.click(within(group).getByRole('radio', { name: /Rahul/ }));
    await waitFor(() => expect(getState().voice).toBe('sarvam:rahul'));
    expect((await api.me()).companion.voice).toBe('sarvam:rahul');
    expect(screen.getByText(/Rahul voice/)).toBeInTheDocument();
  });

  it('saves the avatar too, so it shows everywhere else', async () => {
    await signedIn('studio');
    render(<App />);
    const looks = await screen.findByRole('radiogroup', { name: 'Avatar' });
    fireEvent.click(within(looks).getByRole('radio', { name: /Noor/ }));
    await waitFor(() => expect(getState().look).toBe('noor'));
    expect((await api.me()).companion.look).toBe('noor');
  });

  it('says so when a natural voice can’t be previewed, and offers only the phone’s voices when none are connected', async () => {
    vi.spyOn(api, 'voices').mockResolvedValue(NATURAL);
    vi.spyOn(api, 'previewVoice').mockRejectedValue(Object.assign(new Error('The voices aren’t connected yet. You can still use the phone’s own voices.'), { code: 'voice_unavailable' }));
    await signedIn('studio');
    render(<App />);
    const group = await screen.findByRole('radiogroup', { name: 'Voice' });
    fireEvent.click(await within(group).findByRole('button', { name: 'Preview Priya' }));
    await waitFor(() => expect(getState().previewing).toBeNull());
    cleanup();
    vi.spyOn(api, 'voices').mockResolvedValue({ language: 'en', serverVoices: false, items: NATURAL.items.slice(2) });
    render(<App />);
    expect(await screen.findByText(/Natural voices aren’t switched on yet/)).toBeInTheDocument();
  });
});
