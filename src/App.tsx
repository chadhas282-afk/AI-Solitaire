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