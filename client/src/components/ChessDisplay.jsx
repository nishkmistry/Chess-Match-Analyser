import React from 'react';
import { Chess } from 'chess.js';

const PIECE_IMG = {
  wK: 'https://lichess1.org/assets/piece/cburnett/wK.svg',
  wQ: 'https://lichess1.org/assets/piece/cburnett/wQ.svg',
  wR: 'https://lichess1.org/assets/piece/cburnett/wR.svg',
  wB: 'https://lichess1.org/assets/piece/cburnett/wB.svg',
  wN: 'https://lichess1.org/assets/piece/cburnett/wN.svg',
  wP: 'https://lichess1.org/assets/piece/cburnett/wP.svg',
  bK: 'https://lichess1.org/assets/piece/cburnett/bK.svg',
  bQ: 'https://lichess1.org/assets/piece/cburnett/bQ.svg',
  bR: 'https://lichess1.org/assets/piece/cburnett/bR.svg',
  bB: 'https://lichess1.org/assets/piece/cburnett/bB.svg',
  bN: 'https://lichess1.org/assets/piece/cburnett/bN.svg',
  bP: 'https://lichess1.org/assets/piece/cburnett/bP.svg',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export default function ChessDisplay({ fen }) {
  
  let board = [];
  try {
    const chess = new Chess(fen);
    board = chess.board();
  } catch (e) {
    
    board = Array(8).fill(null).map(() => Array(8).fill(null));
  }

  return (
    <div style={{ display: 'inline-block', userSelect: 'none' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        width: 480,
        height: 480,
        border: '3px solid #4a5568',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        {RANKS.map((rank, rankIdx) =>
          FILES.map((file, fileIdx) => {
            const isLight = (rankIdx + fileIdx) % 2 === 0;
            const piece = board[rankIdx] && board[rankIdx][fileIdx];
            const pieceKey = piece ? `${piece.color}${piece.type.toUpperCase()}` : null;
            const pieceSrc = pieceKey ? PIECE_IMG[pieceKey] : null;
            const squareName = `${file}${rank}`;

            return (
              <div
                key={squareName}
                title={squareName}
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: isLight ? '#f0d9b5' : '#b58863',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  position: 'relative',
                }}
              >
                {pieceSrc && (
                  <img
                    src={pieceSrc}
                    alt={pieceKey}
                    draggable={false}
                    style={{ width: 52, height: 52, pointerEvents: 'none' }}
                  />
                )}
                
                {fileIdx === 0 && (
                  <span style={{
                    position: 'absolute', top: 1, left: 2,
                    fontSize: 10, fontWeight: 700,
                    color: isLight ? '#b58863' : '#f0d9b5',
                    lineHeight: 1,
                  }}>{rank}</span>
                )}
                
                {rankIdx === 7 && (
                  <span style={{
                    position: 'absolute', bottom: 1, right: 2,
                    fontSize: 10, fontWeight: 700,
                    color: isLight ? '#b58863' : '#f0d9b5',
                    lineHeight: 1,
                  }}>{file}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
