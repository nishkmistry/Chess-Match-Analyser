import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import axios from 'axios';
import { ArrowLeft, ChevronLeft, ChevronRight, Activity, RotateCw } from 'lucide-react';
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
