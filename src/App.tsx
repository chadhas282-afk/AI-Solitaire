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