import { useMemo } from 'react';

const PIECES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];

// The theme's Lichess piece set, in the shape react-chessboard expects
export default function usePieceSet(set) {
  return useMemo(() => {
    if (!set) return undefined;
    const pieceMap = {};
    PIECES.forEach((p) => {
      pieceMap[p] = () => (
        <img
          src={`https://lichess1.org/assets/piece/${set}/${p}.svg`}
          alt={p}
          draggable={false}
          style={{ width: '100%', height: '100%' }}
        />
      );
    });
    return pieceMap;
  }, [set]);
}
