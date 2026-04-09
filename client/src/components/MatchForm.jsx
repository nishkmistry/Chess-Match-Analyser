import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Download } from 'lucide-react';

export default function MatchForm({ onMatchesFetched, apiUrl }) {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error("Please enter a username");
    
    setIsSubmitting(true);

    try {
      const response = await axios.post(`${apiUrl}/fetch`, { username: username.trim() });
      
      const { fetched, matches } = response.data;
      if (fetched === 0) {
        toast.info('No new games found to fetch.');
      } else {
        toast.success(`Successfully fetched ${fetched} new game(s)!`);
        onMatchesFetched(matches);
      }
      
      
      
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          toast.error(error.response.data.error || 'User or games not found.');
        } else if (error.response.status === 400) {
          const detail = error.response.data.error || 'Validation error';
          toast.error(detail);
        } else {
          toast.error('Failed to fetch games.');
        }
      } else {
        toast.error('Network error. Is the server running?');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Download size={20} className="text-blue-500" /> Fetch Latest Games
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label className="block text-slate-600 font-medium mb-1">Chess.com Username</label>
          <input 
            required type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., hikaru"
          />
        </div>

        <button 
          type="submit" disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {isSubmitting ? 'Fetching...' : 'Fetch Matches'}
        </button>
      </form>
    </div>
  );
}

