import fs from 'fs';
import path from 'path';

const root = path.resolve('frontend/src');
const src = fs.readFileSync(path.join(root, 'pages/Investments.jsx'), 'utf8');
const lines = src.split('\n');

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const holdingsHeader = `import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  TrendingUp, DollarSign, Wallet, AlertCircle, Search, RefreshCw,
  Link2, Unlink, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getInvestmentMarketHealth, triggerInvestmentPriceSync,
  searchInvestmentSecurities, bindInvestmentSecurity,
  setInvestmentBrokerCash, setInvestmentHoldingQuantity, setInvestmentHoldingAvgCost,
} from '../../../api/client';
import StatCard from '../../ui/StatCard';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt, fmtQty } from '../investmentPageFmt';
import { MarketHoldingCards, CostBasisHoldingCards } from './HoldingsCardGrid';

`;

const holdingsBody = slice(234, 988)
  .replace(/^function /gm, 'export function ')
  .replace(/^const fmt = .*$/m, '')
  .replace(/^const fmtQty = .*$/m, '')
  .replace(/^const BROKER_COLORS = \{[\s\S]*?^const HOLDING_COLORS = \[[\s\S]*?\];\n\n/m, '');

// Inject card grids into MarketHoldingsTable and HoldingsTable
let holdings = holdingsHeader + holdingsBody;

holdings = holdings.replace(
  /(<div className="card overflow-hidden">\s*\n\s*<div className="px-5 py-3 border-b[^]*?Open positions)/,
  `$1`
);

holdings = holdings.replace(
  `      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Open positions — market value`,
  `      <MarketHoldingCards data={data} showEur={showEur} onBind={(h) => setBindTarget(h)} onUnbind={onUnbind} />
      <div className="card overflow-hidden hidden md:block">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Open positions — market value`
);

holdings = holdings.replace(
  `  return (
    <div className="card overflow-hidden">
      {title && (
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title} ({data.length})</h2>`,
  `  return (
    <>
      <CostBasisHoldingCards data={data} open={open} />
      <div className="card overflow-hidden hidden md:block">
      {title && (
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title} ({data.length})</h2>`
);

holdings = holdings.replace(
  `      </div>
    </div>
  );
}

// ── Full investment transaction`,
  `      </div>
    </div>
    </>
  );
}

`
);

fs.writeFileSync(path.join(root, 'components/investments/holdings/index.jsx'), holdings);

const importHeader = `import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { previewInvestmentImport, commitInvestmentImport } from '../../../api/client';
import LoadingSpinner from '../../ui/LoadingSpinner';
import { fmt } from '../investmentPageFmt';
import { detectBroker } from '../investmentPageApi';

`;

const importBody = slice(61, 230).replace(/^function InvestmentImport/, 'export default function InvestmentImport');
fs.writeFileSync(path.join(root, 'components/investments/import/InvestmentImport.jsx'), importHeader + importBody);

const ledgerHeader = `import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Download, History, Pencil } from 'lucide-react';
import clsx from 'clsx';
import {
  getInvestmentTransactions, updateInvestmentTransaction, exportInvestmentTransactionsCSV,
  createManualInvestmentTransaction, deleteInvestmentTransaction, getInvestmentTransactionAudit,
} from '../../../api/client';
import LoadingSpinner from '../../ui/LoadingSpinner';
import UserNoteField from '../../transactions/UserNoteField';
import ManualInvestmentTransactionModal from '../ManualInvestmentTransactionModal';
import InvestmentTabFilters from '../filters/InvestmentTabFilters';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt } from '../investmentPageFmt';

`;

let ledgerBody = slice(992, 1320)
  .replace(/^function InvestmentLedger/, 'export default function InvestmentLedger');

ledgerBody = ledgerBody.replace(
  `  const brokerOptions = Object.entries(BROKER_LABELS);

  const invalidateInvestmentQueries`,
  `  const brokerOptions = Object.entries(BROKER_LABELS);
  const [localBroker, setLocalBroker] = useState('');
  const effectiveBroker = brokerFilter || localBroker;

  const invalidateInvestmentQueries`
);

ledgerBody = ledgerBody.replace(
  `queryKey: ['invTx', page, search, brokerFilter, hasNotesOnly, sourceType]`,
  `queryKey: ['invTx', page, search, effectiveBroker, hasNotesOnly, sourceType]`
);

ledgerBody = ledgerBody.replace(
  `broker: brokerFilter || undefined,`,
  `broker: effectiveBroker || undefined,`
);

ledgerBody = ledgerBody.replace(
  `      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search ticker, ISIN, details, notes…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-8 w-full"
            />
          </div>
          <select
            className="input w-full"
            value={sourceType}
            onChange={(e) => { setSourceType(e.target.value); setPage(1); }}
          >
            <option value="">All sources</option>
            <option value="manual">Manual only</option>
            <option value="imported">Imported only</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer touch-manipulation min-h-[44px]">
            <input
              type="checkbox"
              checked={hasNotesOnly}
              onChange={(e) => { setHasNotesOnly(e.target.checked); setPage(1); }}
              className="rounded border-gray-300 w-4 h-4"
            />
            Has my note only
          </label>
        </div>
      </div>`,
  `      <InvestmentTabFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search ticker, ISIN, details, notes…"
        brokerFilter={brokerFilter ? brokerFilter : localBroker}
        onBrokerChange={brokerFilter ? undefined : (v) => { setLocalBroker(v); setPage(1); }}
        showBroker={!brokerFilter}
        sourceType={sourceType}
        onSourceTypeChange={(v) => { setSourceType(v); setPage(1); }}
        showSource
        hasNotesOnly={hasNotesOnly}
        onHasNotesOnlyChange={(v) => { setHasNotesOnly(v); setPage(1); }}
        showNotes
      />`
);

fs.writeFileSync(path.join(root, 'components/investments/ledger/InvestmentLedger.jsx'), ledgerHeader + ledgerBody);

console.log('Split complete');
