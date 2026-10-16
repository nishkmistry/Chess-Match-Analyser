import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import axios from 'axios';
import { toast } from 'react-toastify';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { LoaderCircle } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API_BASE } from '../lib/api';
import { figurine } from '../lib/chess';
import { evaluatePositions, formatEval, winChances } from '../lib/evaluation';
import { lossPct } from '../lib/insights';
import { listAccounts, resolveAccount, sourceLabel } from '../lib/matches';
import usePieceSet from './usePieceSet';
import AccountPicker from './AccountPicker';

// A move counts if it keeps nearly all of what the engine's move keeps (3 points of win probability)
const TOLERANCE = 0.06;

const sideToMove = (fen) => fen.split(' ')[1];
const moveLabel = (fen, san) => `${fen.split(' ')[5]}${sideToMove(fen) === 'w' ? '.' : '…'} ${figurine(san)}`;
const uciOf = (m) => `${m.from}${m.to}${m.promotion ?? ''}`;

function scheduleText(result) {
  if (!result) return null;
  if (result.streak === 0) return 'It comes back in 10 minutes.';
  const days = Math.round(result.interval_days);
  return `Next time: in ${days} day${days === 1 ? '' : 's'}${result.streak >= 3 ? '. You’ve now solved it three times running.' : '.'}`;
}

function DeckLine({ deck }) {
  return (
    <p className="mt-2 text-muted tabular-nums">
      {deck.due} due · {deck.total} in the deck · {deck.learned} learned
    </p>
  );
}

// One puzzle on the board. Keyed by puzzle id, so every puzzle starts from a clean slate.
function PuzzleView({ puzzle, position, onRecorded, onNext }) {
  const { theme } = useTheme();
  const pieces = usePieceSet(theme?.pieces);
  const [boardFen, setBoardFen] = useState(puzzle.fen);
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(null);  // { status: 'checking' | 'solved' | 'missed', ... }
  const [schedule, setSchedule] = useState(null);
  const check = useRef(null);

  useEffect(() => () => check.current?.abort(), []);

  const record = async (solved) => {
    try {
      const res = await axios.post(`${API_BASE}/puzzles/${puzzle.puzzle_id}/attempt`, { solved });
      setSchedule(res.data);
      onRecorded(puzzle, solved, res.data);
    } catch (err) {
      console.error('Saving the attempt failed', err);
      toast.error('Your answer could not be saved.');
    }
  };

  const tryMove = (from, to) => {
    if (!puzzle || attempt) return false;
    const game = new Chess(puzzle.fen);
    const solutionPromo = puzzle.solution_uci.slice(0, 4) === `${from}${to}` ? puzzle.solution_uci[4] : undefined;
    let move;
    try {
      move = game.move({ from, to, promotion: solutionPromo ?? 'q' });
    } catch {
      return false;
    }
    setBoardFen(game.fen());
    setSelected(null);

    if (uciOf(move) === puzzle.solution_uci) {
      setAttempt({ status: 'solved', move, exact: true });
      record(true);
      return true;
    }

    // A different move: ask Stockfish whether it's as good as the stored answer
    const controller = new AbortController();
    check.current = controller;
    setAttempt({ status: 'checking', move });
    evaluatePositions([puzzle.fen, game.fen()], { depth: 14, movetime: 1500, signal: controller.signal })
      .then(({ scores: [best, yours] }) => {
        const sign = sideToMove(puzzle.fen) === 'w' ? 1 : -1;
        const solved = (winChances(best) - winChances(yours)) * sign <= TOLERANCE;
        setAttempt({ status: solved ? 'solved' : 'missed', move, exact: false, best, yours });
        if (!solved) setBoardFen(puzzle.fen);
        record(solved);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Engine check failed', err);
        setAttempt(null);
        setBoardFen(puzzle.fen);
        toast.error('Stockfish couldn’t check that move. Try again.');
      });
    return true;
  };

  const giveUp = () => {
    setAttempt({ status: 'missed', move: null, gaveUp: true });
    setBoardFen(puzzle.fen);
    record(false);
  };

  const onSquareClick = ({ square, piece }) => {
    if (!puzzle || attempt) return;
    const mine = piece && piece.pieceType[0] === sideToMove(puzzle.fen);
    if (selected && selected !== square && !mine) {
      tryMove(selected, square);
      return;
    }
    setSelected(mine ? square : null);
  };

  const side = sideToMove(puzzle.fen);
  const youWhite = puzzle.player_color !== 'black';
  const opponent = (youWhite ? puzzle.black_username : puzzle.white_username) || 'your opponent';
  const solutionSan = puzzle.solution_san;
  const arrows = [];
  if (attempt?.status === 'missed') {
    if (attempt.move) arrows.push({ startSquare: attempt.move.from, endSquare: attempt.move.to, color: 'rgba(185, 28, 28, 0.75)' });
    arrows.push({ startSquare: puzzle.solution_uci.slice(0, 2), endSquare: puzzle.solution_uci.slice(2, 4), color: 'rgba(21, 128, 61, 0.85)' });
  }

  const squareStyles = {};
  if (selected) squareStyles[selected] = { backgroundColor: 'rgba(234, 179, 8, 0.45)' };
  if (attempt?.move && attempt.status !== 'missed') {
    squareStyles[attempt.move.from] = { backgroundColor: 'rgba(234, 179, 8, 0.32)' };
    squareStyles[attempt.move.to] = { backgroundColor: 'rgba(234, 179, 8, 0.48)' };
  }

  return (
    <div>
      <div className="mt-8 grid grid-cols-1 items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="mx-auto w-full max-w-[min(36rem,calc(100svh-12rem))]">
          <Chessboard
            options={{
              id: 'training-board',
              position: boardFen ?? puzzle.fen,
              boardOrientation: side === 'w' ? 'white' : 'black',
              allowDragging: !attempt,
              canDragPiece: ({ piece }) => piece.pieceType[0] === side,
              onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
              onSquareClick,
              animationDurationInMs: 180,
              darkSquareStyle: { backgroundColor: theme.board.dark },
              lightSquareStyle: { backgroundColor: theme.board.light },
              pieces,
              arrows,
              squareStyles,
            }}
          />
          <p className="mt-2 hidden text-xs text-muted sm:block">Drag a piece, or click it and then its square.</p>
        </div>

        <div>
          <p className="text-sm text-muted tabular-nums">
            {position}
          </p>
          <h2 className="mt-1 font-serif text-[1.9rem] font-semibold leading-tight text-ink">
            {side === 'w' ? 'White' : 'Black'} to play
          </h2>
          <p className="mt-2 leading-relaxed text-muted">
            You went wrong here against <span className="text-ink">{opponent}</span> on {sourceLabel(puzzle.source)},
            {' '}{format(new Date(puzzle.played_at), 'd MMM yyyy')}. Find a better move.
          </p>

          <div className="mt-6 border-t border-rule pt-5" aria-live="polite">
            {!attempt && (
              <button type="button" onClick={giveUp} className="btn btn-line">Show the answer</button>
            )}

            {attempt?.status === 'checking' && (
              <p className="flex items-center gap-2 font-serif italic text-muted">
                <LoaderCircle size={14} className="animate-spin" /> Checking {figurine(attempt.move.san)} with Stockfish…
              </p>
            )}

            {attempt?.status === 'solved' && (
              <p className="font-serif text-[18px] leading-[1.55] text-ink">
                <span className="font-semibold text-green-700 dark:text-green-400">Solved.</span>{' '}
                {attempt.exact
                  ? <><span className="fig">{figurine(solutionSan)}</span> is the move.</>
                  : <><span className="fig">{figurine(attempt.move.san)}</span> holds up as well as Stockfish’s <span className="fig">{figurine(solutionSan)}</span> ({formatEval(attempt.yours)}).</>}
              </p>
            )}

            {attempt?.status === 'missed' && (
              <p className="font-serif text-[18px] leading-[1.55] text-ink">
                {attempt.gaveUp
                  ? <>The move was <span className="fig font-semibold">{figurine(solutionSan)}</span>.</>
                  : <>
                      <span className="font-semibold text-red-700 dark:text-red-400">Not quite.</span>{' '}
                      <span className="fig">{figurine(attempt.move.san)}</span> scores {formatEval(attempt.yours)}; Stockfish plays{' '}
                      <span className="fig font-semibold">{figurine(solutionSan)}</span> ({formatEval(attempt.best)}).
                    </>}
              </p>
            )}

            {attempt && attempt.status !== 'checking' && (
              <>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  In the game you played <span className="fig text-ink">{moveLabel(puzzle.fen, puzzle.played_san)}</span>, which cost
                  {' '}{Math.round(lossPct(puzzle.win_chance_loss))}% of your winning chances.
                  {' '}<Link to={`/analysis/${puzzle.match_id}?ply=${puzzle.ply - 1}`} className="link">Open the game</Link>
                </p>
                {schedule && <p className="mt-2 text-sm text-muted">{scheduleText(schedule)}</p>}
                <button type="button" onClick={onNext} className="btn btn-ink mt-5">Next puzzle</button>
              </>
            )}
          </div>

          <p className="mt-10 border-t border-rule pt-4 text-xs leading-relaxed text-muted">
            Every puzzle is a position from your own games where Stockfish found a much better move than the one you played.
            Solve it and it comes back after 1 day, then 3, then further apart each time. Miss it and it returns in 10 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}

async function fetchDeck(all, account) {
  try {
    const params = { ...(all && { all: '1' }), ...(account && { username: account.username, source: account.source }) };
    const res = await axios.get(`${API_BASE}/puzzles`, { params });
    return res.data;
  } catch (err) {
    console.error('Failed to load puzzles', err);
    toast.error('Could not load your training deck.');
    return { puzzles: [], total: 0, due: 0, learned: 0, next_due_at: null };
  }
}

export default function TrainPage({ matches, loading, account, onAccountChange }) {
  const [deck, setDeck] = useState(null);       // { puzzles, total, due, learned, next_due_at }
  const [practiceAll, setPracticeAll] = useState(false);
  const [index, setIndex] = useState(0);

  const accounts = useMemo(() => listAccounts(matches), [matches]);
  const activeKey = resolveAccount(accounts, account);
  const active = accounts.find((a) => a.key === activeKey) ?? null;

  const load = (all) => fetchDeck(all, active).then((data) => {
    setDeck(data);
    setIndex(0);
  });

  // A new account means a new deck. Wait for the game list, which says whose deck it is.
  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    fetchDeck(false, active).then((data) => {
      if (cancelled) return;
      setDeck(data);
      setIndex(0);
      setPracticeAll(false);
    });
    return () => { cancelled = true; };
    // `active` is derived from activeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, loading]);

  // Keep the counts in the header honest without reloading the queue mid-session
  const onRecorded = useCallback((puzzle, solved, result) => {
    setDeck((d) => d && {
      ...d,
      due: Math.max(0, d.due - (new Date(puzzle.due_at) <= new Date() ? 1 : 0)),
      learned: d.learned + (result.streak === 3 ? 1 : 0) - (!solved && puzzle.streak >= 3 ? 1 : 0),
    });
  }, []);

  if (!deck) {
    return (
      <div>
        <div className="skeleton h-12 w-64" />
        <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="skeleton aspect-square w-full max-w-[min(36rem,calc(100svh-14rem))]" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  const puzzle = deck.puzzles[index] ?? null;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-ink md:text-5xl">Training</h1>
          <DeckLine deck={deck} />
        </div>
        <AccountPicker accounts={accounts} value={activeKey} onChange={onAccountChange} />
      </div>

      {puzzle ? (
        <PuzzleView
          key={`${puzzle.puzzle_id}-${index}`}
          puzzle={puzzle}
          position={`Puzzle ${index + 1} of ${deck.puzzles.length}${practiceAll ? ' · whole deck' : ''}`}
          onRecorded={onRecorded}
          onNext={() => (index + 1 < deck.puzzles.length ? setIndex(index + 1) : load(practiceAll))}
        />
      ) : (
        <div className="mx-auto max-w-xl py-16 text-center">
          {deck.total === 0 ? (
            <>
              <p className="font-serif text-2xl text-ink">Your deck is empty.</p>
              <p className="mt-3 leading-relaxed text-muted">
                Puzzles come from your own mistakes. Each time Stockfish reviews one of your games, the positions where you went wrong are added here.
                Review games from <Link to="/insights" className="link">Insights</Link>, or open one from <Link to="/" className="link">your games</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="font-serif text-2xl text-ink">All caught up.</p>
              {deck.next_due_at && (
                <p className="mt-3 text-muted">The next puzzle is due in {formatDistanceToNowStrict(new Date(deck.next_due_at))}.</p>
              )}
              <button type="button" className="btn btn-line mt-6" onClick={() => { setPracticeAll(true); load(true); }}>
                Practise the whole deck anyway
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
