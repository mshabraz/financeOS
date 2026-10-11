import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { setInvestmentSecurityDisplay } from '../../api/client';
import { resolveDisplaySecondary, officialSecurityName } from '../../utils/securityDisplay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

export default function SecurityRenameModal({ holding, onClose, onSaved }) {
  const qc = useQueryClient();
  const official = officialSecurityName(holding);
  const secondary = resolveDisplaySecondary(holding);

  const [customDisplayName, setCustomDisplayName] = useState(
    holding?.customDisplayName ?? holding?.binding?.customDisplayName ?? '',
  );
  const [nickname, setNickname] = useState(
    holding?.nickname ?? holding?.binding?.nickname ?? '',
  );
  const [displayNotes, setDisplayNotes] = useState(
    holding?.displayNotes ?? holding?.binding?.displayNotes ?? '',
  );

  useEffect(() => {
    setCustomDisplayName(holding?.customDisplayName ?? holding?.binding?.customDisplayName ?? '');
    setNickname(holding?.nickname ?? holding?.binding?.nickname ?? '');
    setDisplayNotes(holding?.displayNotes ?? holding?.binding?.displayNotes ?? '');
  }, [holding]);

  const saveMut = useMutation({
    mutationFn: (override) =>
      setInvestmentSecurityDisplay(
        override ?? {
          broker: holding.broker,
          ticker: holding.ticker,
          currency: holding.currency,
          customDisplayName: customDisplayName.trim() || null,
          nickname: nickname.trim() || null,
          displayNotes: displayNotes.trim() || null,
        },
      ),
    onSuccess: () => {
      [
        'invHoldings', 'invValuations', 'invAnalytics', 'invTx', 'invDividends', 'assets',
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onSaved?.();
      onClose?.();
    },
  });

  if (!holding) return null;

  return (
    <Dialog open={!!holding} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-md p-6 space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-brand-500 shrink-0" />
            <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
              Rename security
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5 text-xs text-gray-500">
            <p className="font-mono text-brand-600 dark:text-brand-400">{holding.ticker}</p>
            {secondary && <p className="mt-1 break-words">{secondary}</p>}
            {official && official !== holding.ticker && (
              <p className="mt-1 text-[10px] opacity-80">Official: {official}</p>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Display name</span>
            <input
              type="text"
              className="input w-full mt-1"
              placeholder="e.g. Global ETF"
              value={customDisplayName}
              onChange={(e) => setCustomDisplayName(e.target.value)}
              autoFocus
            />
            <span className="text-[10px] text-gray-400 mt-1 block">Shown everywhere in Investments</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Nickname (optional)</span>
            <input
              type="text"
              className="input w-full mt-1"
              placeholder="Short label if no display name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Notes (optional)</span>
            <textarea
              className="input w-full mt-1 min-h-[4rem] resize-y"
              placeholder="Personal notes — not shown in lists"
              value={displayNotes}
              onChange={(e) => setDisplayNotes(e.target.value)}
            />
          </label>

          {saveMut.isError && (
            <p className="text-xs text-red-500">{saveMut.error?.message || 'Could not save'}</p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() =>
                saveMut.mutate({
                  broker: holding.broker,
                  ticker: holding.ticker,
                  currency: holding.currency,
                  customDisplayName: null,
                  nickname: null,
                  displayNotes: null,
                })
              }
              disabled={saveMut.isPending}
            >
              Clear custom names
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
