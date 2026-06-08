import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, CheckCircle, XCircle, AlertTriangle, FileText, ArrowRight, Download, Building2, Wallet,
} from 'lucide-react';
import {
  previewImport, commitImport, previewRevolutImport, commitRevolutImport, exportTransactionsCSV,
} from '../../api/client';
import clsx from 'clsx';
import { fmtEur, privText } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const fmt = fmtEur;

/** Heuristic: Revolut English export uses comma-separated headers without semicolons. */
async function detectImportKind(file) {
  const head = await file.slice(0, 4096).text();
  const line = head.split(/\r?\n/)[0]?.toLowerCase() ?? '';
  if (line.includes(';')) return 'bank';
  const fields = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const set = new Set(fields);
  const revolutHeaders = ['type', 'product', 'started date', 'completed date', 'description', 'amount'];
  if (revolutHeaders.every((h) => set.has(h))) return 'revolut';
  return 'bank';
}

function SourceBadge({ kind }) {
  if (kind === 'revolut') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded">
        <Wallet size={11} /> Revolut
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 bg-brand-500/15 px-2 py-0.5 rounded">
      <Building2 size={11} /> Bank
    </span>
  );
}

export default function TransactionImportPanel() {
  usePrivacy();
  const [importKind, setImportKind] = useState(null);
  const [stage, setStage] = useState('drop');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const invalidateAll = () => {
    const keys = [
      'transactions', 'summary', 'trend', 'bycat', 'byincome', 'merchants', 'recurring',
      'assets', 'tagSummary', 'tagAnalytics', 'categories', 'dashboard',
    ];
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const runPreview = useCallback(async (f, kind) => {
    setFile(f);
    setError(null);
    setImportKind(kind);
    setStage('previewing');
    try {
      const data = kind === 'revolut' ? await previewRevolutImport(f) : await previewImport(f);
      setPreview(data);
      setStage('preview');
    } catch (err) {
      if (err.code === 'REVOLUT_USE_DEDICATED' && kind === 'bank') {
        try {
          const data = await previewRevolutImport(f);
          setImportKind('revolut');
          setPreview(data);
          setStage('preview');
          return;
        } catch (e2) {
          setError(e2.message);
        }
      } else {
        setError(err.message);
      }
      setStage('error');
    }
  }, []);

  const onDrop = useCallback(async (accepted) => {
    const f = accepted[0];
    if (!f) return;
    const kind = await detectImportKind(f);
    await runPreview(f, kind);
  }, [runPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const handleCommit = async () => {
    if (!file || !importKind) return;
    setStage('importing');
    try {
      const data = importKind === 'revolut' ? await commitRevolutImport(file) : await commitImport(file);
      setResult(data);
      setStage('done');
      invalidateAll();
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportTransactionsCSV();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transactions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setStage('drop');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setImportKind(null);
  };

  const isRevolut = importKind === 'revolut';
  const sum = preview?.summary;
  const newCount = sum?.newCount ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Export */}
      <div className="card p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Download size={16} className="text-brand-500" />
          Export
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Download one CSV with bank and Revolut rows: original amounts, analytics amounts (50% shared Revolut expenses), categories, and notes.
        </p>
        <button type="button" onClick={handleExport} disabled={exporting} className="btn-secondary gap-2 w-full sm:w-auto">
          <Download size={15} />
          {exporting ? 'Preparing…' : 'Export all transactions'}
        </button>
      </div>

      {/* Import */}
      <div className="card p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Upload size={16} className="text-brand-500" />
          Import
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drop any supported CSV — we detect LHV and SEB bank exports (semicolon) and Revolut exports (comma). Duplicates are skipped automatically.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            <p className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Building2 size={14} /> Bank (LHV)
            </p>
            <p className="text-gray-500 mt-0.5">Semicolon account export</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            <p className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Building2 size={14} /> Bank (SEB)
            </p>
            <p className="text-gray-500 mt-0.5">Internet bank kontoväljavõte (semicolon)</p>
          </div>
          <div className="rounded-lg border border-purple-200/60 dark:border-purple-900/40 px-3 py-2 bg-purple-50/30 dark:bg-purple-950/10">
            <p className="font-medium text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
              <Wallet size={14} /> Revolut
            </p>
            <p className="text-purple-800/80 dark:text-purple-300/70 mt-0.5">English statement CSV · expenses count at 50% in analytics</p>
          </div>
        </div>

        {(stage === 'drop' || stage === 'error') && (
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-colors touch-manipulation',
              isDragActive
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
                : 'border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-900'
            )}
          >
            <input {...getInputProps()} />
            <Upload size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 dark:text-gray-300">
              {isDragActive ? 'Drop your CSV here' : 'Drag & drop bank or Revolut CSV'}
            </p>
            <p className="text-sm text-gray-400 mt-1">or tap to browse</p>
            {error && (
              <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 text-sm justify-center mx-auto max-w-md">
                <XCircle size={16} />
                {error}
              </div>
            )}
          </div>
        )}

        {stage === 'previewing' && (
          <div className="py-10 text-center text-sm text-gray-500 space-y-1">
            <p>Analyzing file…</p>
            <p className="text-xs text-gray-400">Large statements may take up to a minute</p>
          </div>
        )}

        {stage === 'preview' && preview && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <FileText size={20} className={clsx('flex-shrink-0', isRevolut ? 'text-purple-500' : 'text-brand-500')} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{preview.filename}</p>
                  <SourceBadge kind={importKind} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {privText(sum?.account ?? '—')} · {sum?.dateFrom ?? '—'} → {sum?.dateTo ?? '—'}
                </p>
              </div>
              <div className="flex gap-4 sm:gap-6 text-center justify-center">
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{newCount}</p>
                  <p className="text-xs text-gray-400">New</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-400">{sum?.duplicateCount ?? 0}</p>
                  <p className="text-xs text-gray-400">Dupes</p>
                </div>
              </div>
            </div>

            {newCount === 0 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-3 text-sm">
                <AlertTriangle size={16} />
                Nothing new to import (all rows already exist or were skipped).
              </div>
            )}

            {preview.previewTruncated && (
              <p className="text-xs text-gray-500">
                Showing first {preview.preview?.length ?? 0} of {preview.totalRows ?? '—'} rows in preview.
              </p>
            )}

            <div className="card overflow-hidden table-scroll">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date</th>
                    {isRevolut && (
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                    )}
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">
                      {isRevolut ? 'Description' : 'Merchant'}
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {preview.preview?.slice(0, 50).map((tx, i) => (
                    <tr key={i} className={tx.isDuplicate ? 'opacity-40' : ''}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{tx.date}</td>
                      {isRevolut && (
                        <td className="px-4 py-2.5 text-xs">{tx.revolut_type}</td>
                      )}
                      <td className="px-4 py-2.5 truncate max-w-[180px]">
                        {privText(isRevolut ? tx.description : (tx.merchant || tx.beneficiary))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(tx.amount)}</td>
                      <td className="px-4 py-2.5 text-xs">{tx.suggestedCategory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={reset} className="btn-secondary w-full sm:w-auto">Cancel</button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={newCount === 0}
                className="btn-primary gap-2 w-full sm:flex-1"
              >
                Import {newCount} new <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {stage === 'importing' && (
          <div className="py-10 text-center text-sm text-gray-500 space-y-1">
            <p>Importing…</p>
            <p className="text-xs text-gray-400">Please keep this tab open</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="text-center space-y-4 py-4">
            <CheckCircle size={48} className="mx-auto text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import complete</h2>
            <p className="text-sm text-gray-500">
              {result.importedCount} imported · {result.duplicateCount} skipped as duplicates
            </p>
            <button type="button" onClick={reset} className="btn-primary">Import another file</button>
          </div>
        )}
      </div>
    </div>
  );
}
