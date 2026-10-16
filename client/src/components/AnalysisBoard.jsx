import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import axios from 'axios';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { ArrowLeft, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API_URL } from '../lib/api';
import { CLASSIFICATIONS, analyseGame, classifyMoves, formatEval, isExactScore, parseScore, toWhitePov } from '../lib/evaluation';
import { figurine, formatLine, formatTimeControl, gameFromPgn, gameStatus, materialBalance, openingName, parsePgnHeaders, pvToSan } from '../lib/chess';
import { moveTimes } from '../lib/clock';
import { RESULT_TEXT, scoreLine, sourceLabel } from '../lib/matches';
import { saveReview } from '../lib/review';
import EvalBar from './analysis/EvalBar';
import EvalGraph from './analysis/EvalGraph';
import MoveList from './analysis/MoveList';
import GameReview from './analysis/GameReview';
import ReportPanel from './analysis/ReportPanel';
import ClockPanel from './analysis/ClockPanel';
import usePieceSet from './usePieceSet';

const LIVE_DEPTH = 16;
const BADGE_COLORS = { blunder: '#dc2626', mistake: '#ea580c', inaccuracy: '#d97706' };

function PlayerLine({ color, name, elo, isYou, material, toMove }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`size-2.5 shrink-0 self-center border ${color === 'white' ? 'border-stone-400 bg-white' : 'border-stone-900 bg-stone-900 dark:border-stone-500'}`} />
        <span className={`truncate text-ink ${isYou ? 'font-semibold' : ''}`}>{name}</span>
        {elo ? <span className="shrink-0 font-mono text-sm text-muted">{elo}</span> : null}
      </div>
      <span className="shrink-0 font-mono text-xs text-muted">
        {material > 0 && <span className="text-ink">+{material}</span>}
        {material > 0 && toMove && ' · '}
        {toMove && 'to move'}
      </span>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-20" />
      <div className="mt-5 border-b border-rule pb-6">
        <div className="skeleton h-10 w-80 max-w-full" />
        <div className="skeleton mt-3 h-4 w-64" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="mx-auto w-full max-w-[max(20rem,calc(100svh-12rem))]">
          <div className="skeleton aspect-square w-full" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-24" />
          <div className="skeleton h-64" />
        </div>
      </div>
    </div>
  );
}

export default function AnalysisBoard() {
  const { theme } = useTheme();
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const startPly = Number(searchParams.get('ply')) || 0;
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [historyFens, setHistoryFens] = useState([]);
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState('white');

  const [liveEval, setLiveEval] = useState(null);   // { fen, score, depth, pv } — score is from White's POV
  const [showBestMove, setShowBestMove] = useState(true);

  const [evalHistory, setEvalHistory] = useState([]);   // one White-POV score per position
  const [analysedAt, setAnalysedAt] = useState(null);
  const [evalProgress, setEvalProgress] = useState(null);  // { phase, done, total } while analysing the game
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');

  const engine = useRef(null);
  const analysingFen = useRef(null);
  const legalMoves = useRef(new Set());
  const pendingEval = useRef(null);
  const evalUpdateTimeout = useRef(null);
  const batchAbort = useRef(null);
  const boardRef = useRef(null);

  const lastIndex = Math.max(historyFens.length - 1, 0);
  const currentFen = historyFens[currentMoveIndex];
  const clock = useMemo(() => (matchData?.pgn ? moveTimes(matchData.pgn, moves.length) : null), [matchData?.pgn, moves.length]);

  const customPieces = usePieceSet(theme?.pieces);

  // Live engine for the position on the board
  useEffect(() => {
    const worker = new Worker('/stockfish.js');
    engine.current = worker;
    worker.postMessage('uci');

    worker.onmessage = ({ data: line }) => {
      if (typeof line !== 'string' || !isExactScore(line)) return;
      const fen = analysingFen.current;
      const pv = line.match(/ pv (.+)$/)?.[1].split(' ') ?? [];
      // Ignore output still arriving from the previous position's search
      if (!fen || (pv[0] && !legalMoves.current.has(pv[0]))) return;

      pendingEval.current = {
        fen,
        score: toWhitePov(parseScore(line), fen),
        depth: parseInt(line.match(/ depth (\d+)/)?.[1] ?? '0', 10),
        pv,
      };
      if (!evalUpdateTimeout.current) {
        evalUpdateTimeout.current = setTimeout(() => {
          setLiveEval(pendingEval.current);
          evalUpdateTimeout.current = null;
        }, 100);
      }
    };

    return () => {
      worker.terminate();
      clearTimeout(evalUpdateTimeout.current);
      evalUpdateTimeout.current = null;
      batchAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!engine.current || !currentFen) return;
    analysingFen.current = currentFen;
    legalMoves.current = new Set(new Chess(currentFen).moves({ verbose: true }).map((m) => m.lan));
    engine.current.postMessage('stop');
    engine.current.postMessage(`position fen ${currentFen}`);
    engine.current.postMessage(`go depth ${LIVE_DEPTH}`);
  }, [currentFen]);

  // Fetch PGN
  useEffect(() => {
    let cancelled = false;
    const fetchMatch = async () => {
      setLoading(true);
      setError('');
      setReport(null);
      setReportError('');
      setEvalHistory([]);
      setAnalysedAt(null);
      try {
        const [res, saved] = await Promise.all([
          axios.get(`${API_URL}/${matchId}`),
          // A missing review is normal; a failed lookup just means analysing again
          axios.get(`${API_URL}/${matchId}/analysis`).then((r) => r.data).catch(() => null),
        ]);
        if (cancelled) return;
        setMatchData(res.data);
        if (res.data?.player_color) {
          setBoardOrientation(res.data.player_color);
        }

        if (!res.data.pgn) {
          setError('No valid PGN attached to this match.');
          return;
        }
        try {
          const { moves: verbose, fens } = gameFromPgn(res.data.pgn);
          setMoves(verbose);
          setHistoryFens(fens);
          setCurrentMoveIndex(Math.max(0, Math.min(startPly, fens.length - 1)));
          if (saved?.evals?.length === fens.length) {
            setEvalHistory(saved.evals);
            setAnalysedAt(saved.analysed_at);
          }
          if (saved?.report) setReport({ ...saved.report, reported_at: saved.reported_at });
        } catch (pgnError) {
          console.error('PGN parse error:', pgnError);
          setError(`Could not parse game PGN. (${pgnError.message})`);
        }
      } catch (err) {
        if (!cancelled) setError('Failed to fetch match. ' + (err.response?.data?.error || ''));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchMatch();
    return () => { cancelled = true; };
    // startPly only matters when the game first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const goToMove = useCallback((index) => {
    setCurrentMoveIndex(Math.max(0, Math.min(index, lastIndex)));
  }, [lastIndex]);

  const step = useCallback((delta) => {
    setCurrentMoveIndex((i) => Math.max(0, Math.min(i + delta, lastIndex)));
  }, [lastIndex]);

  const flipBoard = useCallback(() => setBoardOrientation((o) => (o === 'white' ? 'black' : 'white')), []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const actions = {
        ArrowRight: () => step(1),
        ArrowLeft: () => step(-1),
        ArrowUp: () => goToMove(0),
        Home: () => goToMove(0),
        ArrowDown: () => goToMove(lastIndex),
        End: () => goToMove(lastIndex),
        f: flipBoard,
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step, goToMove, flipBoard, lastIndex]);

  const runAnalysis = useCallback(async () => {
    batchAbort.current?.abort();
    const controller = new AbortController();
    batchAbort.current = controller;
    setEvalProgress({ phase: 'scan', done: 0, total: historyFens.length });
    try {
      const { evals, best } = await analyseGame(historyFens, {
        signal: controller.signal,
        onProgress: setEvalProgress,
      });
      setEvalHistory(evals);
      try {
        const saved = await saveReview(matchData, { moves, fens: historyFens, evals, best });
        setAnalysedAt(saved.data.analysed_at);
        if (saved.data.puzzles) toast.info(`${saved.data.puzzles} position${saved.data.puzzles === 1 ? '' : 's'} added to your training deck.`);
      } catch (saveError) {
        console.error('Saving the review failed:', saveError);
        toast.error('Review finished, but it could not be saved.');
      }
      return evals;
    } finally {
      if (batchAbort.current === controller) {
        batchAbort.current = null;
        setEvalProgress(null);
      }
    }
  }, [historyFens, matchData, moves]);

  const handleAnalyze = () => {
    runAnalysis().catch((err) => {
      if (err.name !== 'AbortError') toast.error('Engine analysis failed');
    });
  };

  const handleGenerateReport = async () => {
    setReportError('');
    let evals = evalHistory;
    if (evals.length === 0) {
      try {
        evals = await runAnalysis();
      } catch (err) {
        if (err.name !== 'AbortError') toast.error('Engine analysis failed');
        return;
      }
    }

    setReportLoading(true);
    try {
      const res = await axios.post(`${API_URL}/${matchId}/report`, {
        moves: moves.map((m) => m.san),
        evals,
        clocks: clock?.times.map(({ left, spent, pressure }) => ({ left, spent, pressure })),
      });
      setReport(res.data);
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      console.error('Report generation failed:', err);
      setReportError(message);
      toast.error(`Report failed: ${message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const labelForPly = useCallback((ply) => {
    const m = moves[ply - 1];
    if (!m) return null;
    return `${m.before.split(' ')[5]}${m.color === 'w' ? '.' : '…'} ${figurine(m.san)}`;
  }, [moves]);

  const jumpToPly = (ply) => {
    goToMove(ply);
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const classifications = useMemo(
    () => (evalHistory.length ? classifyMoves(evalHistory, historyFens) : []),
    [evalHistory, historyFens],
  );

  const live = liveEval?.fen === currentFen ? liveEval : null;
  const displayScore = live?.score ?? evalHistory[currentMoveIndex] ?? null;
  const status = useMemo(() => (currentFen ? gameStatus(currentFen) : null), [currentFen]);
  const line = useMemo(() => (live?.pv.length ? pvToSan(currentFen, live.pv) : []), [live, currentFen]);
  const material = currentFen ? materialBalance(currentFen) : 0;
  const whiteToMove = currentFen?.split(' ')[1] === 'w';

  const lastMove = moves[currentMoveIndex - 1];
  const lastMoveTag = classifications[currentMoveIndex];

  const squareStyles = lastMove
    ? {
        [lastMove.from]: { backgroundColor: 'rgba(234, 179, 8, 0.32)' },
        [lastMove.to]: { backgroundColor: 'rgba(234, 179, 8, 0.48)' },
      }
    : {};

  const arrows = showBestMove && !status && live?.pv[0]
    ? [{ startSquare: live.pv[0].slice(0, 2), endSquare: live.pv[0].slice(2, 4), color: 'rgba(21, 128, 61, 0.8)' }]
    : [];

  const squareRenderer = ({ square, children }) => (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {lastMoveTag && square === lastMove?.to && (
        <span
          className="pointer-events-none absolute right-[4%] top-[4%] z-10 grid size-[34%] place-items-center rounded-full font-mono text-[clamp(8px,1.3vw,12px)] font-semibold text-white shadow ring-[1.5px] ring-white"
          style={{ backgroundColor: BADGE_COLORS[lastMoveTag] }}
        >
          {CLASSIFICATIONS[lastMoveTag].symbol}
        </span>
      )}
    </div>
  );

  const headers = useMemo(() => parsePgnHeaders(matchData?.pgn), [matchData?.pgn]);

  if (loading) return <AnalysisSkeleton />;

  if (error || historyFens.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-serif text-2xl text-ink">This game couldn’t be opened.</p>
        <p className="mt-2 text-sm text-muted">{error || 'It has no moves to look at.'}</p>
        <Link to="/" className="btn btn-line mt-6">
          <ArrowLeft size={15} /> Back to your games
        </Link>
      </div>
    );
  }

  const white = matchData?.white_username || 'White';
  const black = matchData?.black_username || 'Black';
  const you = (matchData?.tracked_username || '').toLowerCase();
  const gameUrl = matchData?.game_hash?.startsWith('http') ? matchData.game_hash : null;
  const meta = [
    [sourceLabel(matchData?.source), matchData?.played_at && format(new Date(matchData.played_at), 'd MMMM yyyy')].filter(Boolean).join(', '),
    formatTimeControl(headers.TimeControl),
    openingName(headers),
  ].filter(Boolean);

  const players = {
    white: { color: 'white', name: white, elo: matchData?.white_elo, isYou: white.toLowerCase() === you, material },
    black: { color: 'black', name: black, elo: matchData?.black_elo, isYou: black.toLowerCase() === you, material: -material },
  };
  const top = boardOrientation === 'white' ? 'black' : 'white';
  const bottom = boardOrientation;
  const bestMove = line[0] ? formatLine([line[0]]) : null;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
        <ArrowLeft size={14} /> All games
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-rule pb-6">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[2.6rem]">
            {white} <span className="font-normal text-muted">–</span> {black}
          </h1>
          <p className="mt-2 text-muted">{meta.join(' · ')}</p>
        </div>
        <div className="flex items-baseline gap-5">
          {gameUrl && (
            <a href={gameUrl} target="_blank" rel="noreferrer" className="link text-sm">
              Open on {sourceLabel(matchData?.source)} ↗
            </a>
          )}
          <span className={`font-serif text-[2.6rem] font-semibold leading-none ${RESULT_TEXT[matchData?.result] ?? 'text-ink'}`}>
            {scoreLine(matchData)}
          </span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 items-start gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={boardRef} className="mx-auto w-full max-w-[max(20rem,calc(100svh-12rem))] scroll-mt-6">
          <PlayerLine {...players[top]} material={Math.max(players[top].material, 0)} toMove={!status && (top === 'white') === whiteToMove} />
          <div className="flex gap-1.5">
            <EvalBar score={displayScore} orientation={boardOrientation} />
            <div className="min-w-0 flex-1">
              <Chessboard
                options={{
                  id: 'analysis-board',
                  position: currentFen,
                  boardOrientation,
                  allowDragging: false,
                  animationDurationInMs: 180,
                  darkSquareStyle: { backgroundColor: theme.board.dark },
                  lightSquareStyle: { backgroundColor: theme.board.light },
                  pieces: customPieces,
                  arrows,
                  squareStyles,
                  squareRenderer,
                }}
              />
            </div>
          </div>
          <PlayerLine {...players[bottom]} material={Math.max(players[bottom].material, 0)} toMove={!status && (bottom === 'white') === whiteToMove} />

          <div className="mt-1 flex items-center justify-between gap-2 border-y border-rule py-1.5">
            <div className="flex items-center">
              <button type="button" onClick={() => goToMove(0)} disabled={currentMoveIndex === 0} className="icon-btn" aria-label="First move" title="First move (↑)">
                <ChevronsLeft size={18} />
              </button>
              <button type="button" onClick={() => step(-1)} disabled={currentMoveIndex === 0} className="icon-btn" aria-label="Previous move" title="Previous move (←)">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => step(1)} disabled={currentMoveIndex >= lastIndex} className="icon-btn" aria-label="Next move" title="Next move (→)">
                <ChevronRight size={18} />
              </button>
              <button type="button" onClick={() => goToMove(lastIndex)} disabled={currentMoveIndex >= lastIndex} className="icon-btn" aria-label="Last move" title="Last move (↓)">
                <ChevronsRight size={18} />
              </button>
            </div>
            <span className="fig truncate text-sm text-ink tabular-nums">
              {currentMoveIndex === 0 ? 'Starting position' : labelForPly(currentMoveIndex)}
            </span>
            <button type="button" onClick={flipBoard} className="icon-btn" aria-label="Flip board" title="Flip board (F)">
              <ArrowUpDown size={17} />
            </button>
          </div>
          <p className="mt-2 hidden text-xs text-muted sm:block">
            Arrow keys step through the game, ↑ and ↓ jump to the start and end, F flips the board.
          </p>

          {evalHistory.length > 0 && (
            <div className="mt-5">
              <EvalGraph
                evals={evalHistory}
                classifications={classifications}
                moves={moves}
                currentIndex={currentMoveIndex}
                onSelect={goToMove}
              />
              <p className="mt-1.5 text-xs text-muted">Evaluation over the game. White’s advantage is shaded light. Click anywhere to jump there.</p>
            </div>
          )}

          {clock && (
            <ClockPanel
              clock={clock}
              moves={moves}
              classifications={classifications}
              currentIndex={currentMoveIndex}
              onSelect={goToMove}
              white={white}
              black={black}
              you={matchData?.player_color ? matchData.player_color[0] : null}
            />
          )}
        </div>

        <div className="space-y-10">
          <section>
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <h2 className="section-title">Engine</h2>
              <span className="font-mono text-xs text-muted">
                Stockfish{live && !status ? ` · depth ${live.depth}` : ''}
              </span>
            </div>
            <div className="flex items-baseline gap-4 pt-3">
              <span className="font-mono text-[1.75rem] font-semibold leading-none text-ink tabular-nums">
                {formatEval(displayScore)}
              </span>
              <span className="min-w-0 truncate text-sm text-muted">
                {status ?? (bestMove ? <>best is <span className="fig text-[15px] font-medium text-ink">{bestMove}</span></> : 'thinking…')}
              </span>
            </div>
            {line.length > 1 && (
              <p className="fig mt-2 truncate text-[13px] text-muted" title={formatLine(line)}>{formatLine(line)}</p>
            )}
            <label className="mt-3 flex w-fit items-center gap-2 text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={showBestMove} onChange={(e) => setShowBestMove(e.target.checked)} className="accent-[var(--theme-primary)]" />
              Draw the best move on the board
            </label>
          </section>

          <section>
            <h2 className="section-title border-b border-rule pb-2">Moves</h2>
            <div className="pt-2">
              <MoveList moves={moves} classifications={classifications} currentIndex={currentMoveIndex} onSelect={goToMove} />
            </div>
          </section>

          <GameReview
            evals={evalHistory}
            classifications={classifications}
            fens={historyFens}
            progress={evalProgress}
            onAnalyze={handleAnalyze}
            white={white}
            black={black}
            savedAt={analysedAt}
          />

          <ReportPanel
            report={report}
            loading={reportLoading}
            error={reportError}
            onGenerate={handleGenerateReport}
            onJump={jumpToPly}
            labelForPly={labelForPly}
            busy={evalProgress !== null}
            needsAnalysis={evalHistory.length === 0}
          />
        </div>
      </div>
    </div>
  );
}
