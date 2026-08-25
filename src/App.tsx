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
  const gameOver = !won && !autoCompleteAvailable && isDeadEnd(state);
  return { ...state, won, gameOver, autoCompleteAvailable, timerActive: !won && !gameOver };
}

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState(1));

  useEffect(() => {
    if (!state.timerActive) return;
    const interval = setInterval(() => dispatch({ type: 'TICK_TIMER' }), 1000);
    return () => clearInterval(interval);
  }, [state.timerActive]);

  const autoCompleteRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state.isAutoCompleting && !state.won) {
      autoCompleteRef.current = setInterval(() => dispatch({ type: 'AUTO_COMPLETE_STEP' }), 150);
    } else {
      if (autoCompleteRef.current) { clearInterval(autoCompleteRef.current); autoCompleteRef.current = null; }
    }
    return () => { if (autoCompleteRef.current) clearInterval(autoCompleteRef.current); };
  }, [state.isAutoCompleting, state.won]);

  useEffect(() => {
    if (state.particleEvents.length === 0) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_PARTICLES' }), 2000);
    return () => clearTimeout(t);
  }, [state.particleEvents.length]);

  const wrappedDispatch = useCallback((action: GameAction) => {
    if (
      action.type !== 'HINT' &&
      action.type !== 'CLEAR_HINT' &&
      action.type !== 'TICK_TIMER' &&
      action.type !== 'CLEAR_PARTICLES' &&
      action.type !== 'CLEAR_TOAST'
    ) {
      if (state.hint) dispatch({ type: 'CLEAR_HINT' });
    }
    dispatch(action);
  }, [state.hint]);

  return (
    <GameContext.Provider value={{ state, dispatch: wrappedDispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}

interface EmptyPileProps {
  pileRef: PileRef;
  suit?: Suit;
  label?: string;
  className?: string;
}

export function EmptyPile({ pileRef, suit, label, className = '' }: EmptyPileProps) {
  const { state } = useGame();
  const droppableId = `empty::${pileRef.type}::${pileRef.index ?? 'x'}`;

  const isHintTarget =
    state.hint?.toPile.type === pileRef.type &&
    state.hint?.toPile.index === pileRef.index;

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { pileRef },
    });

  return (
    <div
      ref={setNodeRef}
      className={`
        w-[4.2rem] h-[5.8rem] sm:w-[4.8rem] sm:h-[6.8rem] lg:w-[5.2rem] lg:h-[7.2rem]
        rounded-xl flex items-center justify-center
        transition-all duration-200
        ${isHintTarget ? 'hint-target' : ''}
        ${className}
      `}
      style={{
        border: isOver
          ? '2px solid rgba(255,255,255,0.35)'
          : '2px dashed rgba(255,255,255,0.12)',
        background: isOver ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        boxShadow: isOver ? 'inset 0 0 20px rgba(255,255,255,0.05)' : 'none',
      }}
    >
      {suit ? (
        <span className="text-2xl sm:text-3xl text-white/15 select-none">{SUIT_SYMBOLS[suit]}</span>
      ) : label ? (
        <span className="text-sm sm:text-base font-display font-bold text-white/10 select-none">{label}</span>
      ) : (
        <span className="text-white/10 select-none text-2xl">◇</span>
      )}
    </div>
  );
}

const SUIT_CARD_STYLE: Record<string, { text: string; shadow: string; accent: string }> = {
  hearts:   { text: '#dc2626', shadow: 'rgba(220,38,38,0.15)',   accent: '#fef2f2' },
  diamonds: { text: '#c2410c', shadow: 'rgba(194,65,12,0.15)',   accent: '#fff7ed' },
  spades:   { text: '#1e293b', shadow: 'rgba(30,41,59,0.15)',    accent: '#f8fafc' },
  clubs:    { text: '#14532d', shadow: 'rgba(20,83,45,0.15)',    accent: '#f0fdf4' },
};

interface CardProps {
  card: Card;
  fromPile: PileRef;
  cardIndex?: number;
  style?: React.CSSProperties;
  isTop?: boolean;
  isDragOverlay?: boolean;
}

export function CardComponent({
  card, fromPile, cardIndex = 0, style, isTop = false, isDragOverlay = false,
}: CardProps) {
  const { state, dispatch } = useGame();
  const draggableId = `${card.id}::${fromPile.type}::${fromPile.index ?? 'x'}`;

  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: draggableId,
    disabled: !card.faceUp || isDragOverlay,
    data: { card, fromPile, cardIndex },
  });

  const isHintSource = state.hint?.cardId === card.id;
  const isRed = SUIT_COLORS[card.suit] === 'red';
  const styles = SUIT_CARD_STYLE[card.suit];

  const dragStyle: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!card.faceUp) return;
    dispatch({ type: 'DOUBLE_CLICK_CARD', cardId: card.id, fromPile });
  };

  if (!card.faceUp) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
           ...dragStyle,
          boxShadow: '0 3px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
        }}
        className={`
          relative rounded-xl no-select
          w-[4.2rem] h-[5.8rem] sm:w-[4.8rem] sm:h-[6.8rem] lg:w-[5.2rem] lg:h-[7.2rem]
          overflow-hidden
          ${isDragging ? 'opacity-0' : ''}
          transition-shadow duration-150
        `}
        {...attributes}
        {...listeners}

      >

        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2847 50%, #1a3560 100%)',
        }} />

        <div className="absolute inset-[3px] rounded-lg border border-blue-400/20" />

        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `repeating-linear-gradient(45deg, #60a5fa 0px, #60a5fa 1px, transparent 1px, transparent 8px),
                            repeating-linear-gradient(-45deg, #60a5fa 0px, #60a5fa 1px, transparent 1px, transparent 8px)`,
        }} />

        {['tl','tr','bl','br'].map(pos => (
          <div key={pos} className={`absolute w-1.5 h-1.5 rounded-full bg-blue-300/30
            ${pos.includes('t') ? 'top-2' : 'bottom-2'}
            ${pos.includes('l') ? 'left-2' : 'right-2'}`} />
        ))}

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-blue-300/15 text-3xl select-none font-bold">♦</span>
        </div>

        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/8 to-transparent rounded-t-xl pointer-events-none" />
      </div>
    );
  }

  const rankLabel = RANK_LABELS[card.rank];
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const isFaceCard = card.rank >= 11;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...dragStyle,
        background: `linear-gradient(145deg, #fffef7 0%, ${styles.accent} 100%)`,
        boxShadow: isDragging
          ? 'none'
          : `0 3px 8px ${styles.shadow}, 0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
      onDoubleClick={handleDoubleClick}
      className={`
        relative rounded-xl cursor-grab active:cursor-grabbing no-select
        w-[4.2rem] h-[5.8rem] sm:w-[4.8rem] sm:h-[6.8rem] lg:w-[5.2rem] lg:h-[7.2rem]
        border border-gray-200/80
        transition-all duration-150 overflow-hidden
        ${isDragging ? 'opacity-0' : 'opacity-100'}
        ${isHintSource ? 'hint-source' : ''}
        ${!isDragOverlay && card.faceUp ? 'hover:-translate-y-1 hover:shadow-lg' : ''}
        select-none
      `}
      {...attributes}
      {...listeners}
    >

      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color: styles.text }}>
        <span className="text-sm sm:text-[15px] font-black font-display leading-none">{rankLabel}</span>
        <span className="text-[11px] sm:text-xs leading-none mt-[-1px]">{suitSymbol}</span>
      </div>

      {isFaceCard ? (

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-3xl sm:text-4xl lg:text-[2.6rem] leading-none select-none" style={{
            color: styles.text,
            textShadow: `0 2px 8px ${styles.shadow}`,
          }}>{suitSymbol}</span>
          <span className="text-[10px] sm:text-xs font-display font-bold uppercase tracking-widest opacity-40" style={{ color: styles.text }}>
            {rankLabel === 'J' ? 'Jack' : rankLabel === 'Q' ? 'Queen' : 'King'}
          </span>
        </div>
      ) : (

        <PipGrid rank={card.rank} symbol={suitSymbol} color={styles.text} />
      )}

      <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color: styles.text }}>
        <span className="text-sm sm:text-[15px] font-black font-display leading-none">{rankLabel}</span>
        <span className="text-[11px] sm:text-xs leading-none mt-[-1px]">{suitSymbol}</span>
      </div>

      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/50 to-transparent rounded-t-xl pointer-events-none" />
    </div>
  );
}

function PipGrid({ rank, symbol, color }: { rank: number; symbol: string; color: string }) {
  const pips = getPipPositions(rank);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3">
      <div className="relative w-full h-full">
        {pips.map((pip, i) => (
          <div
            key={i}
            className="absolute select-none text-[10px] sm:text-xs font-bold leading-none"
            style={{
              color,
              left: `${pip.x}%`,
              top: `${pip.y}%`,
              transform: `translate(-50%, -50%) ${pip.flip ? 'rotate(180deg)' : ''}`,
              opacity: 0.85,
            }}
          >
            {symbol}
             </div>
        ))}
      </div>
    </div>
  );
}

function getPipPositions(rank: number): { x: number; y: number; flip?: boolean }[] {
  const L = 25, R = 75, C = 50;
  const T = 15, TM = 35, M = 50, BM = 65, B = 85;
  switch (rank) {
    case 1:  return [{ x: C, y: M }];
    case 2:  return [{ x: C, y: T }, { x: C, y: B, flip: true }];
    case 3:  return [{ x: C, y: T }, { x: C, y: M }, { x: C, y: B, flip: true }];
    case 4:  return [{ x: L, y: T }, { x: R, y: T }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 5:  return [{ x: L, y: T }, { x: R, y: T }, { x: C, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 6:  return [{ x: L, y: T }, { x: R, y: T }, { x: L, y: M }, { x: R, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 7:  return [{ x: L, y: T }, { x: R, y: T }, { x: C, y: TM }, { x: L, y: M }, { x: R, y: M }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 8:  return [{ x: L, y: T }, { x: R, y: T }, { x: C, y: TM }, { x: L, y: M }, { x: R, y: M }, { x: C, y: BM, flip: true }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 9:  return [{ x: L, y: T }, { x: R, y: T }, { x: L, y: TM }, { x: R, y: TM }, { x: C, y: M }, { x: L, y: BM, flip: true }, { x: R, y: BM, flip: true }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    case 10: return [{ x: L, y: T }, { x: R, y: T }, { x: C, y: TM - 5 }, { x: L, y: TM }, { x: R, y: TM }, { x: L, y: BM, flip: true }, { x: R, y: BM, flip: true }, { x: C, y: BM + 5, flip: true }, { x: L, y: B, flip: true }, { x: R, y: B, flip: true }];
    default: return [];
  }
}

export function CardDragOverlay({ card }: { card: Card }) {
  const styles = SUIT_CARD_STYLE[card.suit];
  const rankLabel = RANK_LABELS[card.rank];
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  return (
    <div
      className="relative rounded-xl no-select select-none overflow-hidden rotate-2 scale-110"
      style={{
        width: '4.8rem', height: '6.8rem',
        background: `linear-gradient(145deg, #fffef7 0%, ${styles.accent} 100%)`,
        boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 8px 20px ${styles.shadow}`,
        border: '1px solid rgba(209,213,219,0.8)',
      }}
    >
      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color: styles.text }}>
        <span className="text-[15px] font-black font-display leading-none">{rankLabel}</span>
        <span className="text-xs leading-none">{suitSymbol}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl select-none" style={{ color: styles.text, opacity: 0.7 }}>{suitSymbol}</span>
      </div>
      <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color: styles.text }}>
        <span className="text-[15px] font-black font-display leading-none">{rankLabel}</span>
        <span className="text-xs leading-none">{suitSymbol}</span>
      </div>
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/50 to-transparent rounded-t-xl pointer-events-none" />
    </div>
  );
}

export function StockPile() {
  const { state, dispatch } = useGame();
  const isEmpty = state.stock.length === 0;

  const handleClick = () => {
    dispatch({ type: 'DRAW_CARD' });
  };

  const stackDepth = Math.min(state.stock.length, 4);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={handleClick}
        className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl"
        title={isEmpty ? 'Recycle waste' : `Draw ${state.drawCount} card(s)`}
        aria-label={isEmpty ? 'Recycle waste' : 'Draw from stock'}
      >

        {!isEmpty && stackDepth >= 3 && (
          <div className="absolute rounded-xl"
            style={{
              inset: 0,
              transform: 'translate(-4px, -4px)',
              background: 'linear-gradient(135deg, #1e3a5f, #0f2847)',
              border: '1px solid rgba(96,165,250,0.1)',
              zIndex: 0,
            }} />
        )}
        {!isEmpty && stackDepth >= 2 && (
          <div className="absolute rounded-xl"
            style={{
              inset: 0,
              transform: 'translate(-2px, -2px)',
              background: 'linear-gradient(135deg, #1e3a5f, #0f2847)',
              border: '1px solid rgba(96,165,250,0.15)',
              zIndex: 1,
            }} />
        )}

        <div
          className={`
            relative rounded-xl overflow-hidden
            w-[4.2rem] h-[5.8rem] sm:w-[4.8rem] sm:h-[6.8rem] lg:w-[5.2rem] lg:h-[7.2rem]
            transition-all duration-200 active:scale-95 cursor-pointer
          `}
          style={{
            zIndex: 2,
            boxShadow: isEmpty
              ? 'inset 0 0 0 1.5px rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3)'
              : '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {isEmpty ? (

            <div className="inset-0 absolute flex flex-col items-center justify-center gap-1.5 rounded-xl"
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '2px dashed rgba(255,255,255,0.12)',
              }}>
              <svg className="w-7 h-7 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {state.stockRecycles > 0 && (
                <span className="text-[10px] text-white/25 font-mono">{state.stockRecycles}×</span>
              )}
            </div>
          ) : (

            <div className="absolute inset-0" style={{
              background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2847 50%, #1a3560 100%)',
            }}>

              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: `repeating-linear-gradient(45deg, #60a5fa 0px, #60a5fa 1px, transparent 1px, transparent 8px),
                                  repeating-linear-gradient(-45deg, #60a5fa 0px, #60a5fa 1px, transparent 1px, transparent 8px)`,
              }} />
              <div className="absolute inset-[3px] rounded-lg border border-blue-300/10" />
              <div className="absolute inset-0 flex items-end justify-end p-2">
                <span className="text-[10px] font-mono text-blue-300/30">{state.stock.length}</span>
              </div>
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/8 to-transparent rounded-t-xl" />
            </div>
          )}
        </div>
      </button>
      <span className="text-[9px] text-white/25 uppercase tracking-widest font-medium">Stock</span>
    </div>
  );
}

export function WastePile() {
  const { state, dispatch } = useGame();
  const { waste, drawCount } = state;

  const { setNodeRef, isOver } = useDroppable({
    id: 'droppable::waste',
    data: { pileRef: { type: 'waste' } },
  });

  if (waste.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <EmptyPile pileRef={{ type: 'waste' }} label="Waste" />
        <span className="text-[9px] text-white/25 uppercase tracking-widest font-medium">Waste</span>
      </div>
    );
  }

  const fanCards = drawCount === 3
    ? waste.slice(Math.max(0, waste.length - 3))
    : waste.slice(-1);

  const fanOffset = 18; 

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={setNodeRef}
        className={`
          relative
          h-[5.8rem] sm:h-[6.8rem] lg:h-[7.2rem]
          transition-all duration-200
          ${isOver ? 'ring-1 ring-white/20 rounded-xl' : ''}
        `}
        style={{
          width: drawCount === 3
            ? `calc(4.2rem + ${(fanCards.length - 1) * fanOffset}px)`
            : '4.2rem',
        }}
      >
        {fanCards.map((card, i) => {
          const isTop = i === fanCards.length - 1;
          const offsetX = drawCount === 3 ? i * fanOffset : 0;
          return (
            <div
              key={card.id}
              className="absolute top-0"
              style={{ left: offsetX, zIndex: i + 1 }}
            >
              <CardComponent
                card={card}
                fromPile={{ type: 'waste' }}
                cardIndex={i}
                isTop={isTop}
              />
            </div>
          );
        })}
      </div>
      <span className="text-[9px] text-white/25 uppercase tracking-widest font-medium">
        Waste ({waste.length})
      </span>
    </div>
  );
}

const FOUNDATION_GLOW: Record<string, string> = {
  spades:   'rgba(139,92,246,0.4)',
  hearts:   'rgba(239,68,68,0.4)',
  diamonds: 'rgba(249,115,22,0.4)',
  clubs:    'rgba(34,197,94,0.4)',
};

export function FoundationPiles() {
  return (
    <div className="flex gap-1.5 sm:gap-2">
      {SUIT_ORDER.map((suit, index) => (
        <FoundationPile key={suit} index={index} />
      ))}
    </div>
  );
}

function FoundationPile({ index }: { index: number }) {
  const { state } = useGame();
  const foundation = state.foundations[index];
  const suit = SUIT_ORDER[index];
  const pileRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `foundation::${index}`,
    data: { pileRef: { type: 'foundation', index } },
     });

  const topCard = foundation.length > 0 ? foundation[foundation.length - 1] : null;
  const isComplete = foundation.length === 13;
  const isHintTarget = state.hint?.toPile.type === 'foundation' && state.hint?.toPile.index === index;
  const glow = FOUNDATION_GLOW[suit];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={(el) => {
          setNodeRef(el);
          (pileRef as any).current = el;
        }}
        className={`
          relative rounded-xl transition-all duration-200
          w-[4.2rem] h-[5.8rem] sm:w-[4.8rem] sm:h-[6.8rem] lg:w-[5.2rem] lg:h-[7.2rem]
          ${isHintTarget ? 'hint-target' : ''}
        `}
        style={{
          boxShadow: isOver ? `0 0 20px ${glow}, 0 0 8px ${glow}` :
                     isComplete ? `0 0 16px ${glow}` : 'none',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        {topCard ? (
          <CardComponent
            card={{ ...topCard, faceUp: true }}
            fromPile={{ type: 'foundation', index }}
            isTop
          />
        ) : (
          <EmptyPile pileRef={{ type: 'foundation', index }} suit={suit} />
        )}

        {isComplete && (
          <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent"
              style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
          </div>
            )}

        {foundation.length > 0 && (
          <div className="absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-10 shadow"
            style={{
              background: isComplete ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(16,185,129,0.9)',
              color: 'white',
            }}>
            {isComplete ? '✓' : foundation.length}
          </div>
        )}
      </div>
      <span className={`text-[9px] uppercase tracking-widest font-medium
        ${SUIT_COLORS[suit] === 'red' ? 'text-red-400/50' : 'text-white/25'}`}>
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

const FACE_DOWN_OFFSET = 18;
const FACE_UP_OFFSET = 28;

export function TableauPiles() {
  const { state } = useGame();
  return (
    <div className="flex gap-1.5 sm:gap-2 lg:gap-2.5 items-start justify-center">
      {state.tableau.map((_, colIndex) => (
        <TableauColumn key={colIndex} colIndex={colIndex} />
      ))}
    </div>
  );
}

function TableauColumn({ colIndex }: { colIndex: number }) {
  const { state } = useGame();
  const column = state.tableau[colIndex];
  const pileRef: PileRef = { type: 'tableau', index: colIndex };

  const faceDownCount = column.filter(c => !c.faceUp).length;
  const faceUpCount = column.filter(c => c.faceUp).length;
   const cardHeightPx = 92; 
  const columnHeight =
    faceDownCount * FACE_DOWN_OFFSET +
    faceUpCount * FACE_UP_OFFSET +
    cardHeightPx + 16;

  const { setNodeRef, isOver } = useDroppable({
    id: `tableau::${colIndex}`,
    data: { pileRef },
  });

  const isHintTarget = state.hint?.toPile.type === 'tableau' && state.hint?.toPile.index === colIndex;

  if (column.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={`rounded-xl transition-all duration-200
          ${isHintTarget ? 'ring-2 ring-emerald-400/40' : ''}
          ${isOver ? 'ring-2 ring-white/20' : ''}
        `}
      >
        <EmptyPile pileRef={pileRef} label="K" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`
        relative
        w-[4.2rem] sm:w-[4.8rem] lg:w-[5.2rem]
        rounded-xl transition-all duration-200
        ${isOver ? 'ring-1 ring-white/15' : ''}
        ${isHintTarget ? 'ring-2 ring-emerald-400/40' : ''}
      `}
      style={{ height: `${columnHeight}px`, minHeight: `${cardHeightPx}px` }}
    >
       {column.map((card, cardIndex) => {
        const prevFaceDown = column.slice(0, cardIndex).filter(c => !c.faceUp).length;
        const prevFaceUp = cardIndex - prevFaceDown;
        const topOffset = prevFaceDown * FACE_DOWN_OFFSET + prevFaceUp * FACE_UP_OFFSET;

        return (
          <div
            key={card.id}
            className="absolute left-0 transition-all duration-200"
            style={{ top: topOffset, zIndex: cardIndex + 1 }}
          >
            <CardComponent
              card={card}
              fromPile={pileRef}
              cardIndex={cardIndex}
              isTop={cardIndex === column.length - 1}
            />
          </div>
        );
      })}

      {isOver && (
        <div
          className="absolute bottom-0 left-0 right-0 h-10 rounded-b-xl"
          style={{
            background: 'linear-gradient(to top, rgba(255,255,255,0.08), transparent)',
            zIndex: column.length + 1,
          }}
        />
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
