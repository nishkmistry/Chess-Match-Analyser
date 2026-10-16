import React, { useMemo, useState } from 'react';
import { format, isThisYear } from 'date-fns';
import { Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_URL } from '../lib/api';
import { RESULT_TEXT, scoreLine, sourceLabel } from '../lib/matches';
import { moveCount, openingName, parsePgnHeaders } from '../lib/chess';

const PAGE_SIZE = 25;
const RESULT_FILTERS = [
  { id: 'All', label: 'All' },
  { id: 'Win', label: 'Won' },
  { id: 'Draw', label: 'Drawn' },
  { id: 'Loss', label: 'Lost' },
];
const SOURCE_FILTERS = [
  { id: 'All', label: 'Every site' },
  { id: 'chess.com', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
];

function Player({ name, elo, isYou }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className={`truncate ${isYou ? 'font-semibold text-ink' : 'text-ink/85'}`}>{name || 'Unknown'}</span>
      {elo ? <span className="shrink-0 font-mono text-xs text-muted">{elo}</span> : null}
    </span>
  );
}

export default function MatchTable({ matches, loading, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [localNotesMap, setLocalNotesMap] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Opening and length come from the PGN; parse once per game list
  const details = useMemo(() => {
    const map = {};
    for (const m of matches) {
      map[m.match_id] = { opening: openingName(parsePgnHeaders(m.pgn || '')), moves: moveCount(m.pgn || '') };
    }
    return map;
  }, [matches]);

  const notesFor = (match) => localNotesMap[match.match_id] !== undefined
    ? localNotesMap[match.match_id]
    : (match.notes || '');

  const handleNotesSave = async (matchId) => {
    try {
      const res = await axios.patch(`${API_URL}/${matchId}/notes`, { notes: notesDraft });
      setLocalNotesMap(prev => ({ ...prev, [matchId]: res.data.notes }));
      toast.success('Note saved');
      setEditingNotesId(null);
    } catch {
      toast.error('Failed to save notes');
    }
  };

  const filteredMatches = matches.filter((match) => {
    const term = searchTerm.toLowerCase();
    const white = (match.white_username || '').toLowerCase();
    const black = (match.black_username || '').toLowerCase();
    const notesLower = notesFor(match).toLowerCase();
    const opening = (details[match.match_id]?.opening || '').toLowerCase();

    const matchesSearch = white.includes(term) || black.includes(term) || notesLower.includes(term) || opening.includes(term);
    const matchesResult = resultFilter === 'All' || match.result === resultFilter;
    const matchesSource = sourceFilter === 'All' || (match.source || 'chess.com') === sourceFilter;

    return matchesSearch && matchesResult && matchesSource;
  });

  const hasFilters = searchTerm || resultFilter !== 'All' || sourceFilter !== 'All';
  const resetPaging = () => setVisible(PAGE_SIZE);

  return (
    <section className="mt-16">
      <div className="flex flex-col gap-4 border-b border-rule pb-3 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="section-title">
          Games
          {!loading && (
            <span className="ml-2 font-sans text-sm font-normal text-muted tabular-nums">
              {hasFilters ? `${filteredMatches.length} of ${matches.length}` : matches.length}
            </span>
          )}
        </h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <div className="tabs" role="group" aria-label="Filter by result">
            {RESULT_FILTERS.map((r) => (
              <button key={r.id} type="button" aria-pressed={resultFilter === r.id} onClick={() => { setResultFilter(r.id); resetPaging(); }}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="tabs" role="group" aria-label="Filter by site">
            {SOURCE_FILTERS.map((s) => (
              <button key={s.id} type="button" aria-pressed={sourceFilter === s.id} onClick={() => { setSourceFilter(s.id); resetPaging(); }}>
                {s.label}
              </button>
            ))}
          </div>
          <label className="relative flex items-center sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-0 text-muted" />
            <input
              type="search"
              placeholder="Player, opening or note"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); resetPaging(); }}
              className="h-8 w-full border-0 border-b border-rule bg-transparent pl-6 text-sm text-ink outline-none placeholder:text-muted/80 focus:border-ink"
              aria-label="Search games"
            />
          </label>
        </div>
      </div>

      {/* relative: keeps the absolutely positioned sr-only header inside the scroller on narrow screens */}
      <div className="scroll-thin relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-3 pr-4 font-normal">Date</th>
              <th className="py-3 pr-4 font-normal">White</th>
              <th className="py-3 pr-4 font-normal">Black</th>
              <th className="py-3 pr-4 text-center font-normal">Result</th>
              <th className="hidden py-3 pr-4 font-normal lg:table-cell">Opening</th>
              <th className="hidden py-3 pr-4 text-right font-normal md:table-cell">Moves</th>
              <th className="py-3 font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-t border-rule">
                  {[16, 28, 28, 10, 40, 8, 16].map((w, j) => (
                    <td key={j} className={`py-3.5 pr-4 ${j === 4 ? 'hidden lg:table-cell' : ''} ${j === 5 ? 'hidden md:table-cell' : ''}`}>
                      <div className="skeleton h-3.5" style={{ width: `${w * 3}px` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredMatches.length === 0 ? (
              <tr className="border-t border-rule">
                <td colSpan="7" className="py-16 text-center">
                  {matches.length === 0 ? (
                    <p className="font-serif text-lg italic text-muted">No games yet. Import a username above to get started.</p>
                  ) : (
                    <p className="text-muted">
                      Nothing matches those filters.{' '}
                      <button type="button" className="link" onClick={() => { setSearchTerm(''); setResultFilter('All'); setSourceFilter('All'); }}>
                        Clear them
                      </button>
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              filteredMatches.slice(0, visible).map((match) => {
                const currentNotes = notesFor(match);
                const isEditing = editingNotesId === match.match_id;
                const isConfirming = confirmDeleteId === match.match_id;
                const you = (match.tracked_username || '').toLowerCase();
                const playedAt = new Date(match.played_at);
                const { opening, moves } = details[match.match_id] ?? {};

                return (
                  <React.Fragment key={match.match_id}>
                    <tr className="group border-t border-rule transition-colors hover:bg-wash">
                      <td className="whitespace-nowrap py-3 pr-4 align-top">
                        <div className="text-ink tabular-nums">{format(playedAt, isThisYear(playedAt) ? 'd MMM' : 'd MMM yyyy')}</div>
                        <div className="text-xs text-muted">{sourceLabel(match.source)}</div>
                      </td>
                      <td className="max-w-[11rem] py-3 pr-4 align-top">
                        <Player name={match.white_username} elo={match.white_elo} isYou={(match.white_username || '').toLowerCase() === you} />
                      </td>
                      <td className="max-w-[11rem] py-3 pr-4 align-top">
                        <Player name={match.black_username} elo={match.black_elo} isYou={(match.black_username || '').toLowerCase() === you} />
                      </td>
                      <td className={`whitespace-nowrap py-3 pr-4 text-center align-top font-mono font-semibold ${RESULT_TEXT[match.result] ?? 'text-muted'}`}>
                        {scoreLine(match)}
                      </td>
                      <td className="hidden max-w-[16rem] py-3 pr-4 align-top text-muted lg:table-cell">
                        <span className="line-clamp-1" title={opening || undefined}>{opening || '—'}</span>
                      </td>
                      <td className="hidden py-3 pr-4 text-right align-top font-mono text-muted tabular-nums md:table-cell">
                        {moves || '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right align-top">
                        {isConfirming ? (
                          <span className="text-sm">
                            <span className="text-muted">Delete this game? </span>
                            <button type="button" className="font-medium text-red-700 hover:underline dark:text-red-400 cursor-pointer" onClick={() => { setConfirmDeleteId(null); onDelete(match.match_id); }}>
                              Delete
                            </button>
                            <span className="text-muted"> / </span>
                            <button type="button" className="text-muted hover:text-ink cursor-pointer" onClick={() => setConfirmDeleteId(null)}>
                              Keep
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-4 text-sm">
                            <span className="inline-flex items-center gap-4 transition sm:opacity-60 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                              <button
                                type="button"
                                className="text-muted hover:text-ink cursor-pointer"
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingNotesId(null);
                                  } else {
                                    setEditingNotesId(match.match_id);
                                    setNotesDraft(currentNotes);
                                  }
                                }}
                              >
                                {currentNotes ? 'Edit note' : 'Note'}
                              </button>
                              <button type="button" className="text-muted hover:text-red-700 dark:hover:text-red-400 cursor-pointer" onClick={() => setConfirmDeleteId(match.match_id)}>
                                Delete
                              </button>
                            </span>
                            {match.pgn && (
                              <Link to={`/analysis/${match.match_id}`} className="font-medium text-accent hover:underline underline-offset-4">
                                Review
                              </Link>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                    {(currentNotes || isEditing) && (
                      <tr>
                        <td />
                        <td colSpan="6" className="pb-3 pr-4">
                          {isEditing ? (
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(e) => { e.preventDefault(); handleNotesSave(match.match_id); }}
                            >
                              <input
                                type="text"
                                autoFocus
                                value={notesDraft}
                                maxLength={1000}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setEditingNotesId(null); }}
                                placeholder="What do you want to remember about this game?"
                                className="field flex-1"
                              />
                              <button type="submit" className="btn btn-ink">Save</button>
                              <button type="button" onClick={() => setEditingNotesId(null)} className="icon-btn" aria-label="Cancel">
                                <X size={16} />
                              </button>
                            </form>
                          ) : (
                            <p className="font-serif text-[15px] italic text-muted">{currentNotes}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && filteredMatches.length > visible && (
        <div className="border-t border-rule pt-4 text-center">
          <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn btn-line">
            Show {Math.min(PAGE_SIZE, filteredMatches.length - visible)} more
          </button>
        </div>
      )}
    </section>
  );
}
