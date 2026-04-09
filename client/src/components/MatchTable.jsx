import React, { useState } from 'react';
import { format } from 'date-fns';
import { Search, Trash2, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MatchTable({ matches, loading, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMatches = matches.filter((match) => {
    const term = searchTerm.toLowerCase();
    const white = (match.white_username || '').toLowerCase();
    const black = (match.black_username || '').toLowerCase();
    
    return white.includes(term) || black.includes(term);
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
        
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search white or black..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
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
              filteredMatches.map((match) => (
                <tr key={match.match_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    {format(new Date(match.played_at), 'MMM d, yyyy')}
                    <div className="text-xs text-slate-400 ml-0.5">
                      {format(new Date(match.played_at), 'HH:mm')}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
