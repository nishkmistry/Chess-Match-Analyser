import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ArrowLeft, ChevronLeft, ChevronRight, Activity, RotateCw, Sparkles, AlertTriangle, Lightbulb, Target, BookOpen } from 'lucide-react';
import { useTheme } from '../ThemeContext';

const API_URL = import.meta.env.PROD ? '/api/matches' : 'http://localhost:5000/api/matches';

export default function AnalysisBoard() {
  const { theme } = useTheme();
  const { matchId } = useParams();
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [historyFens, setHistoryFens] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [moveList, setMoveList] = useState([]);
  const [boardOrientation, setBoardOrientation] = useState('white');
  
  const [evaluation, setEvaluation] = useState('0.00');
  const [bestMove, setBestMove] = useState('');

  const [evalHistory, setEvalHistory] = useState([]);   // array of { type: 'cp'|'mate', val: number }
  const [evalProgress, setEvalProgress] = useState(0);  // 0–100 for progress bar
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState(null);
  
  const engine = useRef(null);
  const evalUpdateTimeout = useRef(null);

  const customPieces = useMemo(() => {
    if (!theme?.pieces) return undefined;
    const pieces = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
    const pieceMap = {};
    pieces.forEach((p) => {
      pieceMap[p] = ({ squareWidth }) => (
        <img
          src={`https://lichess1.org/assets/piece/${theme.pieces}/${p}.svg`}
          alt={p}
          style={{ width: squareWidth, height: squareWidth }}
        />
      );
    });
    return pieceMap;
  }, [theme?.pieces]);
  
  useEffect(() => {
    engine.current = new Worker('/stockfish.js');
    engine.current.postMessage('uci');
    
    engine.current.onmessage = (event) => {
      const line = event.data;
      if (line.includes('info depth') && line.includes('score')) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          const type = scoreMatch[1];
          const val = parseInt(scoreMatch[2], 10);
          
          if (!evalUpdateTimeout.current) {
            evalUpdateTimeout.current = setTimeout(() => {
              if (type === 'mate') {
                setEvaluation({ cp: val, type: 'mate' });
              } else {
                setEvaluation({ cp: val, type: 'cp' });
              }
              evalUpdateTimeout.current = null;
            }, 100);
          }
        }
      }
      if (line.includes('bestmove')) {
        const parts = line.split(' ');
        if (parts[1]) setBestMove(parts[1]);
      }
    };
    
    return () => {
      if (engine.current) engine.current.terminate();
      if (evalUpdateTimeout.current) clearTimeout(evalUpdateTimeout.current);
    };
  }, []);

  const analyzePosition = useCallback((fen) => {
    if (engine.current && fen) {
        engine.current.postMessage('stop');
        engine.current.postMessage(`position fen ${fen}`);
        engine.current.postMessage('go depth 15');
    }
  }, []);

  const batchEvaluate = () => {
    return new Promise((resolve) => {
      if (!engine.current || historyFens.length === 0) return resolve([]);

      const results = new Array(historyFens.length).fill(null);
      let idx = 0;
      let latestEval = null;

      const evalNext = () => {
        if (idx >= historyFens.length) {
          setEvalHistory(results);
          setEvalProgress(100);
          return resolve(results);
        }

        setEvalProgress(Math.round((idx / historyFens.length) * 100));
        latestEval = null;

        engine.current.postMessage('stop');
        engine.current.postMessage(`position fen ${historyFens[idx]}`);
        engine.current.postMessage('go depth 12');

        const handler = (e) => {
          const line = e.data;

          if (line.includes('score')) {
            const m = line.match(/score (cp|mate) (-?\d+)/);
            if (m) latestEval = { type: m[1], val: parseInt(m[2], 10) };
          }

          if (line.startsWith('bestmove')) {
            engine.current.removeEventListener('message', handler);
            results[idx] = latestEval;
            idx++;
            evalNext();
          }
        };

        engine.current.addEventListener('message', handler);
      };

      evalNext();
    });
  };

  const generateReport = async (evalResults) => {
    const evals = evalResults || evalHistory;
    if (evals.length === 0) return;

    setReportLoading(true);
    setReport(null);

    try {
      // Build a compact eval string — one line per half-move
      const evalSummary = evals.map((e, i) => {
        if (!e) return `Move ${i}: unknown`;
        const score = e.type === 'mate'
          ? `#${e.val}`
          : `${(e.val / 100).toFixed(2)}`;
        return `${i}: ${score}`;
      }).join(', ');

      // Extract player names and result for context
      const white = matchData?.white_username || 'White';
      const black = matchData?.black_username || 'Black';
      const result = matchData?.result || 'Unknown';

      const prompt = `You are a chess coach reviewing a game between ${white} (White) and ${black} (Black). The result was: ${result}.

PGN:
${matchData?.pgn || ''}

Stockfish centipawn evaluation per half-move (0=start, positive=White advantage, negative=Black advantage, # prefix=forced mate):
${evalSummary}

Analyze this game and respond with ONLY a valid JSON object using exactly these keys. No markdown, no backticks, no extra text — raw JSON only.

{
  "opening": "Name of the opening or defence, and one sentence on how each side handled the opening phase",
  "turning_point": "The half-move index and move notation where the evaluation shifted most dramatically, and why",
  "blunder": "The single biggest mistake — half-move index, move played, and a short explanation of why it was losing",
  "missed_win": "The most significant missed opportunity — half-move index, what should have been played, and the idea behind it. Use null if there was no clear missed win.",
  "summary": "One sentence describing how the game was ultimately decided"
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',  // Gemini 2.5 Flash supports this — forces JSON output
            }
          })
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Gemini API returned ${res.status}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Empty response from Gemini');

      // Strip fences just in case (responseMimeType should prevent them)
      const cleaned = rawText.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(cleaned);
      setReport(parsed);

    } catch (err) {
      console.error('Report generation failed:', err);
      toast.error(`Report failed: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    let evals = evalHistory;
    if (evals.length === 0) {
      toast.info('Evaluating positions (this takes ~15 seconds)...');
      evals = await batchEvaluate();
    }
    await generateReport(evals);
  };

  // Fetch PGN
  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const res = await axios.get(`${API_URL}/${matchId}`);
        setMatchData(res.data);
        if (res.data?.player_color) {
          setBoardOrientation(res.data.player_color);
        }
        
        if (res.data.pgn) {
          try {
            const pgnGame = new Chess();
            pgnGame.loadPgn(res.data.pgn, { sloppy: true });
            const moves = pgnGame.history({ verbose: true });
            setMoveList(moves.map(m => m.san));

            const replayGame = new Chess();
            const fens = [replayGame.fen()];

            for (const move of moves) {
              replayGame.move(move);
              fens.push(replayGame.fen());
            }

            setHistoryFens(fens);
            setCurrentMoveIndex(0);
            analyzePosition(fens[0]);

          } catch (pgnError) {
            console.error('PGN parse error:', pgnError);
            setError(`Could not parse game PGN. (${pgnError.message})`);
          }
        } else {
          setError('No valid PGN attached to this match.');
        }
      } catch (err) {
        setError('Failed to fetch match. ' + (err.response?.data?.error || ''));
      } finally {
        setLoading(false);
      }
    };
    fetchMatch();
  }, [matchId, analyzePosition]);

  const goToMove = (index) => {
    if (index < 0 || index >= historyFens.length) return;
    setCurrentMoveIndex(index);
    setEvaluation({ cp: 0, type: 'cp' });
    analyzePosition(historyFens[index]);
  };

  const nextMove = useCallback(() => goToMove(currentMoveIndex + 1), [currentMoveIndex, historyFens.length]);
  const prevMove = useCallback(() => goToMove(currentMoveIndex - 1), [currentMoveIndex, historyFens.length]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') nextMove();
      if (e.key === 'ArrowLeft') prevMove();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nextMove, prevMove]);
  
  
  const getDisplayEval = () => {
     if (!historyFens[currentMoveIndex]) return '0.00';
     const fen = historyFens[currentMoveIndex];
     const isWhiteTurn = fen.split(' ')[1] === 'w';
     
     if (evaluation.type === 'mate') {
       return `M${evaluation.cp}`;
     } else if (evaluation.type === 'cp') {
       const evalFactor = isWhiteTurn ? 1 : -1;
       const finalScore = (evaluation.cp * evalFactor / 100).toFixed(2);
       return finalScore > 0 ? `+${finalScore}` : finalScore;
     }
     return '0.00';
  };

  const displayEval = getDisplayEval();

  const currentFen = historyFens[currentMoveIndex] || 'start';

  if (loading || historyFens.length === 0) return <div className="text-center p-12 text-slate-500" style={{ color: 'var(--theme-text-muted)' }}>Loading analysis...</div>;
  if (error) return <div className="text-center p-12 text-rose-500 font-medium">{error}</div>;

  return (
    <div className="rounded-xl shadow-sm border p-6" style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
      
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--theme-text)' }}>
            {matchData?.white_username && matchData?.black_username ? `${matchData.white_username} vs ${matchData.black_username}` : 'Analysis'}
          </h2>
          <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
            {matchData?.result ? `Result: ${matchData.result}` : 'Game Analysis'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[480px]">
            <Chessboard
              position={currentFen}
              boardOrientation={boardOrientation}
              arePiecesDraggable={false}
              customDarkSquareStyle={{ backgroundColor: theme.board.dark }}
              customLightSquareStyle={{ backgroundColor: theme.board.light }}
              customPieces={customPieces}
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-6">
          {/* Progress bar — shown while batch evaluating */}
          {evalProgress > 0 && evalProgress < 100 && (
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${evalProgress}%` }}
              />
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading || historyFens.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-violet-600
                       hover:bg-violet-700 text-white font-medium py-2.5 px-4
                       rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Sparkles size={16} />
            {reportLoading ? 'Generating Report...' : 'Generate AI Report'}
          </button>

          {/* Report display */}
          {report && (
            <div className="rounded-lg border border-slate-100 divide-y divide-slate-100 overflow-hidden">

              <div className="p-4 flex items-start gap-3 bg-white">
                <BookOpen size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Opening
                  </p>
                  <p className="text-sm text-slate-700">{report.opening}</p>
                </div>
              </div>

              <div className="p-4 flex items-start gap-3 bg-white">
                <Target size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Turning Point
                  </p>
                  <p className="text-sm text-slate-700">{report.turning_point}</p>
                </div>
              </div>

              <div className="p-4 flex items-start gap-3 bg-white">
                <AlertTriangle size={16} className="text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Biggest Blunder
                  </p>
                  <p className="text-sm text-slate-700">{report.blunder}</p>
                </div>
              </div>

              {report.missed_win && (
                <div className="p-4 flex items-start gap-3 bg-white">
                  <Lightbulb size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Missed Win
                    </p>
                    <p className="text-sm text-slate-700">{report.missed_win}</p>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-50">
                <p className="text-sm text-slate-600 italic">"{report.summary}"</p>
              </div>
            </div>
          )}

          <div className="rounded-lg p-6 border" style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
            <h3 className="font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--theme-text)' }}>
              <Activity className="text-blue-500" size={18} /> Engine Evaluation
            </h3>
            
            <div className="flex justify-between items-center p-4 rounded-md shadow-sm border mb-2" style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
              <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Score</span>
              <span className={`text-2xl font-mono font-bold ${parseFloat(displayEval) > 0 ? 'text-emerald-600' : parseFloat(displayEval) < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                {displayEval}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-3 rounded-md shadow-sm border text-sm" style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
                <span style={{ color: 'var(--theme-text-muted)' }}>Stockfish Best Move</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--theme-text)' }}>{bestMove || '...'}</span>
            </div>
          </div>

          <div className="rounded-lg p-6 border flex flex-col items-center" style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
            <h3 className="font-semibold w-full mb-4" style={{ color: 'var(--theme-text)' }}>Game Navigation</h3>
            <div className="flex gap-4">
               <button 
                 onClick={prevMove} 
                 disabled={currentMoveIndex <= 0}
                 className="p-3 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
                 title="Previous Move"
               >
                 <ChevronLeft size={24} />
               </button>
               <button
                 onClick={() => setBoardOrientation(o => o === 'white' ? 'black' : 'white')}
                 className="p-3 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 transition cursor-pointer"
                 title="Flip board"
               >
                 <RotateCw size={24} />
               </button>
               <button 
                 onClick={nextMove} 
                 disabled={currentMoveIndex >= historyFens.length - 1}
                 className="p-3 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
                 title="Next Move"
               >
                 <ChevronRight size={24} />
               </button>
            </div>
            <div className="mt-4 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                Move {Math.floor((currentMoveIndex + 1) / 2)} of {Math.floor(historyFens.length / 2)}
            </div>
          </div>

          <div className="rounded-lg border p-4 max-h-64 overflow-y-auto" style={{ backgroundColor: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
            <h3 className="font-semibold mb-3 text-sm" style={{ color: 'var(--theme-text)' }}>Move List</h3>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-0.5 text-sm font-mono">
              {Array.from({ length: Math.ceil(moveList.length / 2) }, (_, i) => (
                <React.Fragment key={i}>
                  <span className="select-none" style={{ color: 'var(--theme-text-muted)' }}>{i + 1}.</span>
                  <button
                    onClick={() => goToMove((i * 2) + 1)}
                    className={`text-left px-1.5 py-0.5 rounded transition cursor-pointer
                      ${currentMoveIndex === (i * 2) + 1
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-200'}`}
                    style={currentMoveIndex !== (i * 2) + 1 ? { color: 'var(--theme-text)' } : {}}
                  >
                    {moveList[i * 2]}
                  </button>
                  {moveList[i * 2 + 1] ? (
                    <button
                      onClick={() => goToMove((i * 2) + 2)}
                      className={`text-left px-1.5 py-0.5 rounded transition cursor-pointer
                        ${currentMoveIndex === (i * 2) + 2
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-200'}`}
                      style={currentMoveIndex !== (i * 2) + 2 ? { color: 'var(--theme-text)' } : {}}
                    >
                      {moveList[i * 2 + 1]}
                    </button>
                  ) : <span />}
                </React.Fragment>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
