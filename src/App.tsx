import React, { useEffect, useState, useRef, useCallback, createContext, useContext, useReducer } from 'react';
import { useDraggable, useDroppable, DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners, DragStartEvent, DragEndEvent } from '@dnd-kit/core';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Color = 'red' | 'black';
export type DrawCount = 1 | 3;

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  justDealt?: boolean; 
}

export type PileType = 'stock' | 'waste' | 'foundation' | 'tableau';

export interface PileRef {
  type: PileType;
  index?: number;
}

export interface HintMove {
  cardId: string;
  fromPile: PileRef;
  toPile: PileRef;
  description: string;
  isDrawAction?: boolean;
}

export interface ParticleEvent {
  id: number;
  x: number;
  y: number;
  suit: Suit;
}

export interface GameSnapshot {
  stock: Card[];
  waste: Card[];
  foundations: [Card[], Card[], Card[], Card[]];
  tableau: Card[][];
  score: number;
  moves: number;
  combo: number;
}

export interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: [Card[], Card[], Card[], Card[]];
  tableau: Card[][];
  score: number;
  moves: number;
  drawCount: DrawCount;
  hint: HintMove | null;
  history: GameSnapshot[];
  won: boolean;
  gameOver: boolean;
  autoCompleteAvailable: boolean;
  isAutoCompleting: boolean;
  startTime: number | null;
  elapsedTime: number;
  timerActive: boolean;
  stockRecycles: number;
  lastAction: string;
  combo: number;           
  bestCombo: number;
  particleEvents: ParticleEvent[];
  toastMessage: string | null;
  toastKey: number;
  foundationCount: number; 
}

export const SUIT_ORDER: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const SUIT_COLORS: Record<Suit, Color> = {
  spades: 'black',
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
};

export const RANK_LABELS: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export type GameAction =
  | { type: 'NEW_GAME'; drawCount?: DrawCount }
  | { type: 'DRAW_CARD' }
  | { type: 'MOVE_CARD'; cardId: string; fromPile: PileRef; toPile: PileRef }
  | { type: 'MOVE_TO_FOUNDATION'; cardId: string; fromPile: PileRef; foundationIndex: number; particlePos?: { x: number; y: number } }
  | { type: 'HINT' }
  | { type: 'CLEAR_HINT' }
  | { type: 'UNDO' }
  | { type: 'AUTO_COMPLETE_STEP' }
  | { type: 'TOGGLE_DRAW_COUNT' }
  | { type: 'TICK_TIMER' }
  | { type: 'DOUBLE_CLICK_CARD'; cardId: string; fromPile: PileRef }
  | { type: 'CLEAR_PARTICLES' }
  | { type: 'CLEAR_TOAST' };

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, faceUp: false });
    }
     }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createInitialState(drawCount: DrawCount = 1): GameState {
  const deck = shuffle(createDeck());
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);
  let deckIdx = 0;

  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[deckIdx++] };
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }

  const stock: Card[] = deck.slice(deckIdx).map(c => ({ ...c, faceUp: false }));
  const foundations: [Card[], Card[], Card[], Card[]] = [[], [], [], []];

  return {
    stock,
    waste: [],
    foundations,
    tableau,
    score: 0,
    moves: 0,
    drawCount,
    hint: null,
    history: [],
    won: false,
    gameOver: false,
    autoCompleteAvailable: false,
    isAutoCompleting: false,
    startTime: Date.now(),
    elapsedTime: 0,
    timerActive: true,
    stockRecycles: 0,
    lastAction: '',
    combo: 0,
    bestCombo: 0,
    particleEvents: [],
    toastMessage: null,
    toastKey: 0,
    foundationCount: 0,
  };
}

export function foundationIndexForSuit(suit: Suit): number {
  return SUIT_ORDER.indexOf(suit);
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    stock: state.stock.map(c => ({ ...c })),
    waste: state.waste.map(c => ({ ...c })),
    foundations: state.foundations.map(f => f.map(c => ({ ...c }))) as [Card[], Card[], Card[], Card[]],
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
  };
}

export function snapshotState(state: GameState) {
  return {
    stock: state.stock.map(c => ({ ...c })),
    waste: state.waste.map(c => ({ ...c })),
    foundations: state.foundations.map(f => f.map(c => ({ ...c }))) as [Card[], Card[], Card[], Card[]],
    tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
    score: state.score,
    moves: state.moves,
    combo: state.combo,
    };
}

export function getColor(suit: Suit): Color {
  return SUIT_COLORS[suit];
}

export function canMoveToFoundation(card: Card, foundation: Card[]): boolean {
  if (!card.faceUp) return false;
  if (foundation.length === 0) {
    return card.rank === 1; 
  }
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function canMoveToTableau(card: Card, tableau: Card[]): boolean {
  if (!card.faceUp) return false;
  if (tableau.length === 0) {
    return card.rank === 13; 
  }
  const top = tableau[tableau.length - 1];
  if (!top.faceUp) return false;
  return getColor(card.suit) !== getColor(top.suit) && card.rank === top.rank - 1;
}

export function getMovableSequence(column: Card[], fromIndex: number): Card[] {
  if (fromIndex < 0 || fromIndex >= column.length) return [];

  if (!column[fromIndex].faceUp) return [];
  return column.slice(fromIndex);
}

export function findCardInTableau(cardId: string, tableau: Card[][]): { colIndex: number; rowIndex: number } | null {
  for (let colIndex = 0; colIndex < tableau.length; colIndex++) {
    const rowIndex = tableau[colIndex].findIndex(c => c.id === cardId);
    if (rowIndex !== -1) {
      return { colIndex, rowIndex };
    }
  }
  return null;
}

export function findCard(cardId: string, state: GameState): { pile: PileRef; card: Card } | null {

  for (const card of state.waste) {
    if (card.id === cardId) return { pile: { type: 'waste' }, card };
  }

  for (let i = 0; i < state.foundations.length; i++) {
    for (const card of state.foundations[i]) {
      if (card.id === cardId) return { pile: { type: 'foundation', index: i }, card };
    }
  }

  for (let i = 0; i < state.tableau.length; i++) {
    for (const card of state.tableau[i]) {
      if (card.id === cardId) return { pile: { type: 'tableau', index: i }, card };
    }
  }

  for (const card of state.stock) {
    if (card.id === cardId) return { pile: { type: 'stock' }, card };
  }
  return null;
}

export function wouldRevealCard(cardId: string, tableau: Card[][]): boolean {
  for (const col of tableau) {
    const idx = col.findIndex(c => c.id === cardId);
    if (idx === -1) continue;

    if (idx > 0 && !col[idx - 1].faceUp) return true;
    if (idx === 0) return false; 
  }
  return false;
}

export function hasAnyValidMove(state: GameState): boolean {
  const { stock, waste, foundations, tableau } = state;

  if (stock.length > 0) return true;
  if (waste.length > 0) return true;

  const allVisibleCards: { card: Card; pile: PileRef }[] = [];

  if (waste.length > 0) {
    allVisibleCards.push({ card: waste[waste.length - 1], pile: { type: 'waste' } });
  }

  for (let i = 0; i < tableau.length; i++) {
    const col = tableau[i];
    for (let j = col.length - 1; j >= 0; j--) {
      if (col[j].faceUp) {
        allVisibleCards.push({ card: col[j], pile: { type: 'tableau', index: i } });

        if (j === col.findIndex(c => c.faceUp)) break;
      }
    }
  }

  for (const { card } of allVisibleCards) {

    for (const f of foundations) {
      if (canMoveToFoundation(card, f)) return true;
    }

    for (const col of tableau) {
      if (canMoveToTableau(card, col)) return true;
    }
  }

  return false;
}

export function canAutoComplete(state: GameState): boolean {
  for (const col of state.tableau) {
    if (col.some(c => !c.faceUp)) return false;
  }
  return true;
  }

export function isWon(state: GameState): boolean {
  return state.foundations.reduce((sum, f) => sum + f.length, 0) === 52;
}

export function findBestHint(state: GameState): HintMove | null {
  const { stock, waste, foundations, tableau } = state;

  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    for (let fi = 0; fi < foundations.length; fi++) {
      if (canMoveToFoundation(card, foundations[fi])) {
        return {
          cardId: card.id,
          fromPile: { type: 'waste' },
          toPile: { type: 'foundation', index: fi },
          description: `Move ${rankLabel(card.rank)}${suitSymbol(card.suit)} to Foundation`,
        };
      }
    }
  }

  for (let ti = 0; ti < tableau.length; ti++) {
    const col = tableau[ti];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    for (let fi = 0; fi < foundations.length; fi++) {
      if (canMoveToFoundation(card, foundations[fi])) {
        return {
          cardId: card.id,
          fromPile: { type: 'tableau', index: ti },
          toPile: { type: 'foundation', index: fi },
          description: `Move ${rankLabel(card.rank)}${suitSymbol(card.suit)} to Foundation`,
        };
      }
    }
  }

  for (let fromCol = 0; fromCol < tableau.length; fromCol++) {
    const col = tableau[fromCol];

    const firstFaceUpIdx = col.findIndex(c => c.faceUp);
    if (firstFaceUpIdx === -1) continue;

    if (firstFaceUpIdx === 0) continue;

    const card = col[firstFaceUpIdx]; 
    for (let toCol = 0; toCol < tableau.length; toCol++) {
      if (toCol === fromCol) continue;
      if (canMoveToTableau(card, tableau[toCol])) {
        return {
          cardId: card.id,
          fromPile: { type: 'tableau', index: fromCol },
          toPile: { type: 'tableau', index: toCol },
          description: `Move sequence to reveal hidden card`,
        };
      }
    }
  }

  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    for (let ti = 0; ti < tableau.length; ti++) {
      if (canMoveToTableau(card, tableau[ti])) {
        return {
          cardId: card.id,
          fromPile: { type: 'waste' },
          toPile: { type: 'tableau', index: ti },
          description: `Move ${rankLabel(card.rank)}${suitSymbol(card.suit)} from Waste to Tableau`,
        };
      }
    }
  }

  for (let fromCol = 0; fromCol < tableau.length; fromCol++) {
    const col = tableau[fromCol];
    const firstFaceUpIdx = col.findIndex(c => c.faceUp);
    if (firstFaceUpIdx === -1) continue;
    const card = col[firstFaceUpIdx];
    if (card.rank === 13) continue; 
    for (let toCol = 0; toCol < tableau.length; toCol++) {
      if (toCol === fromCol) continue;
      if (canMoveToTableau(card, tableau[toCol])) {
        return {
          cardId: card.id,
          fromPile: { type: 'tableau', index: fromCol },
          toPile: { type: 'tableau', index: toCol },
          description: `Move ${rankLabel(card.rank)}${suitSymbol(card.suit)} in Tableau`,
        };
      }
    }
  }

  const hasEmptyCol = tableau.some(col => col.length === 0);
  if (hasEmptyCol) {

    if (waste.length > 0 && waste[waste.length - 1].rank === 13) {
      const card = waste[waste.length - 1];
      const emptyColIdx = tableau.findIndex(col => col.length === 0);
      return {
        cardId: card.id,
        fromPile: { type: 'waste' },
        toPile: { type: 'tableau', index: emptyColIdx },
        description: `Move King to empty column`,
      };
    }

    for (let fromCol = 0; fromCol < tableau.length; fromCol++) {
      const col = tableau[fromCol];
      const firstFaceUpIdx = col.findIndex(c => c.faceUp);
      if (firstFaceUpIdx === -1) continue;
      const card = col[firstFaceUpIdx];
      if (card.rank !== 13) continue;

      const emptyColIdx = tableau.findIndex((c, i) => c.length === 0 && i !== fromCol);
      if (emptyColIdx === -1) continue;
      return {
        cardId: card.id,
        fromPile: { type: 'tableau', index: fromCol },
        toPile: { type: 'tableau', index: emptyColIdx },
        description: `Move King to empty column`,
      };
    }
  }

  if (stock.length > 0) {
    return {
      cardId: '',
      fromPile: { type: 'stock' },
      toPile: { type: 'waste' },
      description: 'Draw from Stock',
      isDrawAction: true,
    };
  }

  if (waste.length > 0 && stock.length === 0) {
    return {
      cardId: '',
      fromPile: { type: 'stock' },
      toPile: { type: 'waste' },
      description: 'Recycle Waste pile',
      isDrawAction: true,
    };
  }

  return null; 
}

export function findAutoCompleteMove(state: GameState): { cardId: string; fromPile: PileRef; foundationIndex: number } | null {
  const { waste, foundations, tableau } = state;

  if (waste.length > 0) {
    const card = waste[waste.length - 1];
    for (let fi = 0; fi < foundations.length; fi++) {
      if (canMoveToFoundation(card, foundations[fi])) {
        return { cardId: card.id, fromPile: { type: 'waste' }, foundationIndex: fi };
      }
    }
    }

  for (let ti = 0; ti < tableau.length; ti++) {
    const col = tableau[ti];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    for (let fi = 0; fi < foundations.length; fi++) {
      if (canMoveToFoundation(card, foundations[fi])) {
        return { cardId: card.id, fromPile: { type: 'tableau', index: ti }, foundationIndex: fi };
      }
    }
  }

  return null;
}

export function isDeadEnd(state: GameState): boolean {
  if (state.won) return false;
  const { stock, waste, foundations, tableau } = state;

  if (stock.length > 0) return false;

  const topCards: { card: typeof waste[0]; pile: PileRef }[] = [];

  if (waste.length > 0) {
    topCards.push({ card: waste[waste.length - 1], pile: { type: 'waste' } });
  }

  for (let i = 0; i < tableau.length; i++) {
    const col = tableau[i];
    for (let j = col.length - 1; j >= 0; j--) {
      if (!col[j].faceUp) break;
      topCards.push({ card: col[j], pile: { type: 'tableau', index: i } });
    }
  }

  for (const { card } of topCards) {
    for (const f of foundations) {
      if (canMoveToFoundation(card, f)) return false;
      }
    for (const col of tableau) {
      if (canMoveToTableau(card, col)) return false;
    }
  }

  if (waste.length > 0) return false;

  return true;
}

const RANK_MAP: Record<number, string> = {
  1: 'A', 11: 'J', 12: 'Q', 13: 'K'
};
function rankLabel(rank: number): string {
  return RANK_MAP[rank] ?? String(rank);
}
const SUIT_MAP: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣'
};
function suitSymbol(suit: string): string {
  return SUIT_MAP[suit] ?? suit;
}

const POINTS = {
  TO_FOUNDATION: 10,
  TABLEAU_FLIP: 5,
  WASTE_TO_TABLEAU: 5,
  FOUNDATION_TO_TABLEAU: -15,
  UNDO: -15,
  COMBO_BONUS: 25,   
};

const MAX_HISTORY = 100;
let particleCounter = 0;

function getComboMessage(combo: number): string | null {
  if (combo === 2) return '2x Combo! 🔥';
  if (combo === 3) return '3x Combo! 🔥🔥';
  if (combo === 4) return '4x Combo! 💥';
   if (combo === 5) return '5x Blazing! 🌟';
  if (combo >= 6) return `${combo}x UNSTOPPABLE! ⚡`;
  return null;
}

function pushHistory(state: GameState): GameState['history'] {
  const snap = snapshotState(state);
  const history = [...state.history, snap];
  if (history.length > MAX_HISTORY) history.shift();
  return history;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case 'NEW_GAME':
      return createInitialState(action.drawCount ?? state.drawCount);

    case 'TOGGLE_DRAW_COUNT': {
      const newDrawCount: DrawCount = state.drawCount === 1 ? 3 : 1;
      return createInitialState(newDrawCount);
    }

    case 'TICK_TIMER':
      if (!state.timerActive || state.won || state.gameOver) return state;
      return { ...state, elapsedTime: state.elapsedTime + 1 };

    case 'CLEAR_HINT':
      return { ...state, hint: null };

    case 'CLEAR_PARTICLES':
      return { ...state, particleEvents: [] };

    case 'CLEAR_TOAST':
      return { ...state, toastMessage: null };

    case 'HINT':
      return { ...state, hint: findBestHint(state) };

    case 'DRAW_CARD': {
      const history = pushHistory(state);
      let { stock, waste, stockRecycles } = state;

      if (stock.length === 0) {
        if (waste.length === 0) return state;
        stock = waste.map(c => ({ ...c, faceUp: false })).reverse();
        waste = [];
        stockRecycles++;
        return {
          ...state, stock, waste, stockRecycles, history, hint: null,
          moves: state.moves + 1, combo: 0, lastAction: 'Recycled stock',
        };
      }

      const count = Math.min(state.drawCount, stock.length);
      const drawn = stock.slice(-count).map(c => ({ ...c, faceUp: true })).reverse();
      const newStock = stock.slice(0, stock.length - count);
      const newWaste = [...waste, ...drawn.reverse()];

      return checkGameStatus({
        ...state, stock: newStock, waste: newWaste, history, hint: null,
        moves: state.moves + 1, combo: 0, lastAction: 'Drew card',
      });
    }

    case 'MOVE_CARD': {
      const { cardId, fromPile, toPile } = action;
      const history = pushHistory(state);
      let newState = { ...state };
      let scoreChange = 0;
      let card: Card | null = null;
      let cardsToMove: Card[] = [];

      if (fromPile.type === 'waste') {
        const idx = state.waste.findIndex(c => c.id === cardId);
        if (idx === -1 || idx !== state.waste.length - 1) return state;
        card = state.waste[idx];
        cardsToMove = [{ ...card, faceUp: true }];
        newState.waste = state.waste.slice(0, -1);
        scoreChange += POINTS.WASTE_TO_TABLEAU;
        } else if (fromPile.type === 'tableau') {
        const colIdx = fromPile.index!;
        const col = state.tableau[colIdx];
        const cardIdx = col.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return state;
        card = col[cardIdx];
        if (!card.faceUp) return state;
        cardsToMove = getMovableSequence(col, cardIdx).map(c => ({ ...c, faceUp: true }));
        const newCol = col.slice(0, cardIdx);
        if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
          newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true };
          scoreChange += POINTS.TABLEAU_FLIP;
        }
        const newTab = [...state.tableau];
        newTab[colIdx] = newCol;
        newState.tableau = newTab;
      } else if (fromPile.type === 'foundation') {
        const fIdx = fromPile.index!;
        const foundation = state.foundations[fIdx];
        if (foundation.length === 0) return state;
        card = foundation[foundation.length - 1];
        if (card.id !== cardId) return state;
        cardsToMove = [{ ...card, faceUp: true }];
        const newFoundations = state.foundations.map((f, i) =>
          i === fIdx ? f.slice(0, -1) : f
        ) as GameState['foundations'];
        newState.foundations = newFoundations;
        scoreChange += POINTS.FOUNDATION_TO_TABLEAU;
      } else return state;

      if (!card || cardsToMove.length === 0) return state;

      if (toPile.type === 'tableau') {
        const toColIdx = toPile.index!;
        const targetCol = newState.tableau[toColIdx];
        if (!canMoveToTableau(cardsToMove[0], targetCol)) return state;
        const newTab = [...newState.tableau];
        newTab[toColIdx] = [...targetCol, ...cardsToMove];
        newState.tableau = newTab;
      } else if (toPile.type === 'foundation') {
        const toFIdx = toPile.index!;
        if (cardsToMove.length !== 1) return state;
        if (!canMoveToFoundation(cardsToMove[0], newState.foundations[toFIdx])) return state;
        const newFoundations = newState.foundations.map((f, i) =>
          i === toFIdx ? [...f, cardsToMove[0]] : f
        ) as GameState['foundations'];
        newState.foundations = newFoundations;
        scoreChange += POINTS.TO_FOUNDATION;
      } else return state;

      newState = {
        ...newState, history,
        score: Math.max(0, state.score + scoreChange),
        moves: state.moves + 1, hint: null, combo: 0, lastAction: 'Moved card',
      };
      return checkGameStatus(newState);
    }

    case 'MOVE_TO_FOUNDATION': {
      const { cardId, fromPile, foundationIndex, particlePos } = action;
      const history = pushHistory(state);
      let newState = { ...state };
      let scoreChange = POINTS.TO_FOUNDATION;
      let card: Card | null = null;

      if (fromPile.type === 'waste') {
        const idx = state.waste.findIndex(c => c.id === cardId);
        if (idx === -1 || idx !== state.waste.length - 1) return state;
        card = state.waste[idx];
        newState.waste = state.waste.slice(0, -1);
      } else if (fromPile.type === 'tableau') {
        const colIdx = fromPile.index!;
        const col = state.tableau[colIdx];
        const cardIdx = col.findIndex(c => c.id === cardId);
        if (cardIdx === -1 || cardIdx !== col.length - 1) return state;
        card = col[cardIdx];
        if (!card.faceUp) return state;
        const newCol = col.slice(0, -1);
        if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
          newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true };
          scoreChange += POINTS.TABLEAU_FLIP;
        }
        const newTab = [...state.tableau];
        newTab[colIdx] = newCol;
        newState.tableau = newTab;
      } else return state;

      if (!card) return state;
      if (!canMoveToFoundation(card, state.foundations[foundationIndex])) return state;

      const newFoundations = state.foundations.map((f, i) =>
        i === foundationIndex ? [...f, { ...card!, faceUp: true }] : f
      ) as GameState['foundations'];

      const newCombo = state.combo + 1;
      const comboBonus = newCombo > 1 ? POINTS.COMBO_BONUS * (newCombo - 1) : 0;
      const toastMessage = getComboMessage(newCombo);
      const bestCombo = Math.max(state.bestCombo, newCombo);

      const newParticles: ParticleEvent[] = particlePos
        ? [...state.particleEvents, { id: particleCounter++, ...particlePos, suit: card.suit }]
        : state.particleEvents;

      const foundationCount = state.foundationCount + 1;

      newState = {
        ...newState,
        foundations: newFoundations,
        history,
        score: Math.max(0, state.score + scoreChange + comboBonus),
        moves: state.moves + 1,
        hint: null,
        combo: newCombo,
        bestCombo,
        particleEvents: newParticles,
        toastMessage,
        toastKey: state.toastKey + 1,
        foundationCount,
        lastAction: 'Foundation move',
      };
      return checkGameStatus(newState);
    }

    case 'DOUBLE_CLICK_CARD': {
      const { cardId, fromPile } = action;
      for (let fi = 0; fi < state.foundations.length; fi++) {
        const f = state.foundations[fi];
        let card: Card | undefined;
        if (fromPile.type === 'waste') {
          card = state.waste[state.waste.length - 1];
          if (!card || card.id !== cardId) continue;
        } else if (fromPile.type === 'tableau') {
          const col = state.tableau[fromPile.index!];
          card = col[col.length - 1];
          if (!card || card.id !== cardId || !card.faceUp) continue;
        } else continue;
        if (canMoveToFoundation(card, f)) {
          return gameReducer(state, { type: 'MOVE_TO_FOUNDATION', cardId, fromPile, foundationIndex: fi });
        }
      }
      for (let ti = 0; ti < state.tableau.length; ti++) {
        const col = state.tableau[ti];
        let card: Card | undefined;
        if (fromPile.type === 'waste') {
          card = state.waste[state.waste.length - 1];
          if (!card || card.id !== cardId) continue;
        } else if (fromPile.type === 'tableau') {
          if (fromPile.index === ti) continue;
          const fromCol = state.tableau[fromPile.index!];
          const cardIdx = fromCol.findIndex(c => c.id === cardId);
          if (cardIdx === -1) continue;
          card = fromCol[cardIdx];
          if (!card.faceUp) continue;
        } else continue;
        if (canMoveToTableau(card!, col)) {
          return gameReducer(state, { type: 'MOVE_CARD', cardId, fromPile, toPile: { type: 'tableau', index: ti } });
        }
      }
      return state;
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const snap = history.pop()!;
      return {
        ...state,
        stock: snap.stock, waste: snap.waste,
        foundations: snap.foundations, tableau: snap.tableau,
        score: Math.max(0, snap.score + POINTS.UNDO),
        moves: snap.moves, history, hint: null,
        won: false, gameOver: false, isAutoCompleting: false,
        combo: 0, toastMessage: '↩ Undo (-15pts)', toastKey: state.toastKey + 1,
        lastAction: 'Undo',
        autoCompleteAvailable: canAutoComplete({ ...state, tableau: snap.tableau }),
      };
    }

    case 'AUTO_COMPLETE_STEP': {
      const move = findAutoCompleteMove(state);
      if (!move) {
        if (isWon(state)) return { ...state, won: true, timerActive: false, isAutoCompleting: false };
        return { ...state, isAutoCompleting: false };
      }
      return gameReducer({ ...state, isAutoCompleting: true }, {
        type: 'MOVE_TO_FOUNDATION',
        cardId: move.cardId,
        fromPile: move.fromPile,
        foundationIndex: move.foundationIndex,
      });
    }

    default:
      return state;
  }
}

function checkGameStatus(state: GameState): GameState {
  const won = isWon(state);
  const autoCompleteAvailable = !won && canAutoComplete(state);