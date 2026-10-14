import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { LoaderCircle } from 'lucide-react';

const PLATFORMS = [
  { id: 'chess.com', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
];

export default function MatchForm({ onMatchesFetched, apiUrl }) {
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState('chess.com');
  const [importLimit, setImportLimit] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error("Please enter a username");

    setIsSubmitting(true);

    try {
      const endpoint = platform === 'lichess' ? `${apiUrl}/fetch-lichess` : `${apiUrl}/fetch`;
      const response = await axios.post(`${endpoint}?limit=${importLimit}`, { username: username.trim() });

      const { fetched, matches } = response.data;
      if (fetched === 0) {
        toast.info('No new games since your last import.');
      } else {
        toast.success(`Imported ${fetched} game${fetched === 1 ? '' : 's'}.`);
        onMatchesFetched(matches);
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          toast.error(error.response.data.error || 'User or games not found.');
        } else if (error.response.status === 400) {
          toast.error(error.response.data.error || 'Validation error');
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
    <form onSubmit={handleSubmit} className="w-full shrink-0 lg:w-auto">
      <div className="mb-2.5 flex items-baseline gap-4">
        <span className="text-sm text-muted">Import from</span>
        <div className="tabs" role="group" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          required
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field min-w-0 flex-1 lg:w-48 lg:flex-none"
          placeholder={platform === 'lichess' ? 'Lichess username' : 'Chess.com username'}
          aria-label="Username"
        />
        <select
          value={importLimit}
          onChange={(e) => setImportLimit(Number(e.target.value))}
          className="field w-auto pr-8"
          aria-label="Games to import"
          title={importLimit === 100 ? 'Large imports can take a minute' : undefined}
        >
          <option value={5}>5 games</option>
          <option value={20}>20 games</option>
          <option value={50}>50 games</option>
          <option value={100}>100 games</option>
        </select>
        <button type="submit" disabled={isSubmitting} className="btn btn-ink">
          {isSubmitting ? <><LoaderCircle size={15} className="animate-spin" /> Importing</> : 'Import'}
        </button>
      </div>
    </form>
  );
}
