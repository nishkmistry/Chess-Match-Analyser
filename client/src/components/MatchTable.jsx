import React, { useState } from 'react';
import { format } from 'date-fns';
import { Search, Trash2, Activity, FileText, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.PROD ? '/api/matches' : 'http://localhost:5000/api/matches';

export default function MatchTable({ matches, loading, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [localNotesMap, setLocalNotesMap] = useState({});

  const handleNotesSave = async (matchId) => {
    try {
      const res = await axios.patch(`${API_URL}/${matchId}/notes`, { notes: notesDraft });
      setLocalNotesMap(prev => ({ ...prev, [matchId]: res.data.notes }));
      toast.success('Notes saved');
      setEditingNotesId(null);
    } catch (err) {
      toast.error('Failed to save notes');
    }
  };

  const filteredMatches = matches.filter((match) => {
    const term = searchTerm.toLowerCase();
    const white = (match.white_username || '').toLowerCase();
    const black = (match.black_username || '').toLowerCase();
    const currentNotes = localNotesMap[match.match_id] !== undefined
      ? localNotesMap[match.match_id]
      : (match.notes || '');
    const notesLower = currentNotes.toLowerCase();
    
    const matchesSearch = white.includes(term) || black.includes(term) || notesLower.includes(term);
    const matchesResult = resultFilter === 'All' || match.result === resultFilter;
    const matchesSource = sourceFilter === 'All' || (match.source || 'chess.com') === sourceFilter;

    return matchesSearch && matchesResult && matchesSource;
  });

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading match history...
      </div>
    );
  }

  const getResultStyle = (result) => {
    switch (result) {
      case 'Win': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'Loss': return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'Draw': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-slate-600';
    }
  };

  return (
    <div className="flex flex-col h-full">
      
      <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">Match History</h2>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Results</option>
            <option value="Win">Win</option>
            <option value="Loss">Loss</option>
            <option value="Draw">Draw</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Platforms</option>
            <option value="chess.com">Chess.com</option>
            <option value="lichess">Lichess</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search players or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-medium">Date</th>
              <th className="px-6 py-4 font-medium">White</th>
              <th className="px-6 py-4 font-medium">Black</th>
              <th className="px-6 py-4 font-medium">Rating Diff</th>
              <th className="px-6 py-4 font-medium text-center">Result</th>
              <th className="px-6 py-4 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMatches.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-slate-500 font-medium italic">
                  No matches found.
                </td>
              </tr>
            ) : (
              filteredMatches.map((match) => {
                const currentNotes = localNotesMap[match.match_id] !== undefined
                  ? localNotesMap[match.match_id]
                  : (match.notes || '');
                const isEditing = editingNotesId === match.match_id;

                return (
                  <React.Fragment key={match.match_id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        {format(new Date(match.played_at), 'MMM d, yyyy')}
                        <div className="text-xs text-slate-400 ml-0.5 capitalize">
                          {format(new Date(match.played_at), 'HH:mm')} • {match.source || 'chess.com'}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {match.white_username || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {match.black_username || 'Unknown'}
                      </td>
                      <td className="px-6 py-4">
                        <div><span className="text-slate-400">White: </span>{match.white_elo}</div>
                        <div><span className="text-slate-400">Black: </span>{match.black_elo}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${getResultStyle(match.result)}`}>
                            {match.result}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-3">
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingNotesId(null);
                              } else {
                                setEditingNotesId(match.match_id);
                                setNotesDraft(currentNotes);
                              }
                            }}
                            className={`transition ${currentNotes ? 'text-amber-500 hover:text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Match Notes"
                          >
                            <FileText size={18} />
                          </button>
                          {match.pgn && (
                            <Link
                              to={`/analysis/${match.match_id}`}
                              className="text-blue-500 hover:text-blue-700 transition"
                              title="Analyze Game"
                            >
                              <Activity size={18} />
                            </Link>
                          )}
                          <button
                            onClick={() => {
                                if(window.confirm('Are you sure you want to delete this match?')) {
                                    onDelete(match.match_id);
                                }
                            }}
                            className="text-slate-400 hover:text-rose-500 transition"
                            title="Delete Game"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td colSpan="6" className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={notesDraft}
                              onChange={(e) => setNotesDraft(e.target.value)}
                              placeholder="Add personal match notes (e.g., missed tactical blow move 15)..."
                              className="flex-1 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => handleNotesSave(match.match_id)}
                              className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                              title="Save Notes"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setEditingNotesId(null)}
                              className="p-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
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
    </div>
  );
}
