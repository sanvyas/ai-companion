// TODO(v3): placeholders while the screens are written, one at a time.
const P = (name: string) => () => <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>{name}</div>;
export const Relax = P('Relax'); export const MonthTab = P('Month');
export const GameScreen = P('Game'); export const BreatheScreen = P('Breathe'); export const PlayerScreen = P('Player');
