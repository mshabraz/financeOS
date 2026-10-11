import * as React from 'react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/HoverCard';
import { Building2, CreditCard, Tag, Info } from 'lucide-react';
import CategoryBadge from '../ui/CategoryBadge';
import TransactionSourceBadges from './TransactionSourceBadges';

export default function MerchantHoverCard({ tx, children, privText = (v) => v }) {
  if (!tx) return children;
  const merchantName = tx.merchant || tx.beneficiary || 'Transaction';

  return (
    <HoverCard openDelay={350} closeDelay={150}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3 space-y-2.5" side="top" align="start">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-semibold text-xs">
              <Building2 size={13} className="text-brand-500 shrink-0" />
              <span className="truncate">{privText(merchantName)}</span>
            </div>
            {tx.date && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Date: {tx.date}
              </p>
            )}
          </div>
          <TransactionSourceBadges tx={tx} />
        </div>

        {/* Category & Details */}
        <div className="space-y-1.5 text-xs bg-black/[0.02] dark:bg-white/[0.03] p-2 rounded-xl border border-black/[0.04] dark:border-white/[0.05]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500">Category</span>
            <CategoryBadge icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
          </div>

          {tx.details && (
            <div className="pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
              <span className="text-[10px] uppercase font-medium text-slate-400 dark:text-slate-500 block mb-0.5">Details</span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                {tx.details}
              </p>
            </div>
          )}

          {tx.counterparty_iban && (
            <div className="pt-1 border-t border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between text-[10px]">
              <span className="uppercase font-medium text-slate-400 dark:text-slate-500">IBAN</span>
              <span className="font-mono text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{tx.counterparty_iban}</span>
            </div>
          )}
        </div>

        {/* Pro-tip */}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <Info size={10} />
          Right-click for quick actions & tags
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
