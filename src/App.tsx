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