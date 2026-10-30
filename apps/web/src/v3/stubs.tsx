// TODO(v3): placeholders while the screens are written, one at a time.
const P = (name: string) => () => <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>{name}</div>;
export const TalkTab = P('Talk'); export const Relax = P('Relax'); export const JournalTab = P('Journal'); export const MonthTab = P('Month'); export const YouTab = P('You');
export const CallScreen = P('Call'); export const ChatScreen = P('Chat'); export const WalkScreen = P('Walk'); export const Compose = P('Compose');
export const GameScreen = P('Game'); export const BreatheScreen = P('Breathe'); export const PlayerScreen = P('Player');
