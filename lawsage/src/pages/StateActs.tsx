import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmptyState, PageHeader } from '../components/ui';
import { ActsBrowser } from './ActsBrowser';

type J = { jurisdiction: string; acts: number };

const pretty = (j: string) => j.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const StateActs = () => {
  const [params, setParams] = useSearchParams();
  const [states, setStates] = useState<J[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('list_state_jurisdictions');
      if (error) setError(`${error.message}. Run rag/acts_browser.sql in the Supabase SQL Editor.`);
      else setStates((data as J[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  if (error || states.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-5 sm:p-8">
        <PageHeader title="State Acts" desc="Read the official text of Acts made by State legislatures." />
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {!error && (
          <EmptyState
            icon={<Landmark className="w-5 h-5" />}
            title="No State Acts loaded yet"
            desc="State Acts will appear here, State by State, as they are loaded into the database."
          />
        )}
      </div>
    );
  }

  const chosen = states.find((s) => s.jurisdiction === params.get('state'))?.jurisdiction || states[0].jurisdiction;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <label htmlFor="state-pick" className="text-sm font-medium text-slate-600">State</label>
        <select
          id="state-pick"
          value={chosen}
          onChange={(e) => setParams({ state: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:border-brass-500 focus:ring-2 focus:ring-brass-400/40"
        >
          {states.map((s) => (
            <option key={s.jurisdiction} value={s.jurisdiction}>
              {pretty(s.jurisdiction)} ({s.acts})
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <ActsBrowser
          key={chosen}
          jurisdiction={chosen}
          title={`${pretty(chosen)} Acts`}
          desc={`Read the official text of Acts made by the ${pretty(chosen)} legislature, section by section.`}
          emptyTitle="No Acts loaded yet"
          emptyDesc="Acts for this State will appear here as soon as they are loaded."
        />
      </div>
    </div>
  );
};
