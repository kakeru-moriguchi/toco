/**
 * 【完】試合進行表.pdfの色分け・対戦カードを基準にした検証用データ。
 * 2026-11-26承認：11:30/5面はF7、16:00の下位決勝は7面、8面は予備。
 * 15:45枠の時間は未決定なのでnullを維持する。本番用プリセットではない。
 */
import { TOCO_FIVE_TEAM_ORDER } from '../../src/lib/divisionFormat';

const morning = [
  ['09:00', 'A1 A2 B1 C1 C2 E1 F1 D1'],
  ['09:30', 'A3 B2 B3 C3 E2 E3 F2 D2'],
  ['10:00', 'A4 B4 C4 D3 E4 F3 F4 D4'],
  ['10:30', 'A6 A5 C6 D5 B5 F5 E5 C5'],
  ['11:00', 'A7 B6 E6 C7 B7 F6 E7 D6'],
  ['11:30', 'A8 B8 E8 C8 F7 F8 D7 D8'],
  ['12:00', 'A10 A9 C9 C10 F9 D9 G1 G2'],
  ['12:30', 'B10 B9 E10 E9 F10 D10 G3 G4'],
] as const;

export type PublishedSlot = { court: string; scheduled_at: string; duration_minutes: number | null };
export const qualifyingTimetable = [
  ...morning.flatMap(([scheduled_at,cards]) => cards.split(' ').map((card,index) => ({card,scheduled_at,court:String(index+1),duration_minutes:30}))),
  ...[
    ['13:30','G6','G5'], ['14:15','G8','G7'], ['15:00','G9','G10'],
  ].flatMap(([scheduled_at,...cards]) => cards.map((card,index) => ({card,scheduled_at,court:String(index+7),duration_minutes:30}))),
];

export function qualifyingCard(card: string) {
  const league = card[0];
  const number = Number(card.slice(1));
  const [a,b] = TOCO_FIVE_TEAM_ORDER[number-1];
  return { league, number, a, b, divisionIndex: league <= 'D' ? 0 : league <= 'F' ? 1 : 2, leagueIndex: league.charCodeAt(0)-(league <= 'D' ? 65 : league <= 'F' ? 69 : 71) };
}

export type FinalSlot = PublishedSlot & { divisionIndex: number; tierKey: string; kind: 'quarterfinal' | 'semifinal' | 'final' | 'consolation'; index: number };
const slot = (divisionIndex: number,tierKey: string,kind: FinalSlot['kind'],index: number,scheduled_at: string,court: string): FinalSlot => ({divisionIndex,tierKey,kind,index,scheduled_at,court,duration_minutes:scheduled_at==='15:45' ? null : 45});

export const finalsTimetable: FinalSlot[] = [
  slot(0,'rank1','semifinal',0,'13:30','1'), slot(0,'rank1','semifinal',1,'14:15','2'), slot(0,'rank1','final',0,'15:45','4'), slot(0,'rank1','consolation',0,'15:00','3'),
  slot(0,'rank2','semifinal',0,'13:30','2'), slot(0,'rank2','semifinal',1,'14:15','3'), slot(0,'rank2','final',0,'16:00','1'), slot(0,'rank2','consolation',0,'15:00','4'),
  slot(0,'rank3','semifinal',0,'13:30','3'), slot(0,'rank3','semifinal',1,'14:15','4'), slot(0,'rank3','final',0,'16:00','2'), slot(0,'rank3','consolation',0,'15:45','1'),
  slot(0,'rank4','semifinal',0,'13:30','4'), slot(0,'rank4','semifinal',1,'15:00','1'), slot(0,'rank4','final',0,'16:00','3'), slot(0,'rank4','consolation',0,'15:45','2'),
  slot(0,'rank5','semifinal',0,'14:15','1'), slot(0,'rank5','semifinal',1,'15:00','2'), slot(0,'rank5','final',0,'16:00','4'), slot(0,'rank5','consolation',0,'15:45','3'),
  slot(1,'upper','semifinal',0,'13:30','5'), slot(1,'upper','semifinal',1,'14:15','5'), slot(1,'upper','final',0,'15:45','5'), slot(1,'upper','consolation',0,'15:00','5'),
  slot(1,'lower','quarterfinal',0,'13:30','6'), slot(1,'lower','quarterfinal',1,'14:15','6'),
  slot(1,'lower','semifinal',0,'15:00','6'), slot(1,'lower','semifinal',1,'15:45','6'), slot(1,'lower','final',0,'16:00','7'),
  slot(1,'lower','consolation',0,'16:00','5'), slot(1,'lower','consolation',1,'16:00','6'),
];
