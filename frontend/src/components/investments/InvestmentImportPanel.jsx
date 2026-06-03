import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { previewInvestmentImport, commitInvestmentImport } from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmt } from './investmentPageFmt';
import { detectBroker } from './investmentPageApi';

/** CSV import drop zone (lives here — not under `import/` which is gitignored). */
export default function InvestmentImport({ onDone }) {
  const [stage,    setStage]    = useState('drop');
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [detected, setDetected] = useState(null);
  const [error,    setError]    = useState(null);

  const onDrop = useCallback(async (accepted) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f); setStage('detecting'); setError(null);
    try {
      // Step 1: detect broker
      const det = await detectBroker(f);
      setDetected(det);

      if (det.broker === 'unknown' || det.broker === 'lhv_bank') {
        setError(det.broker === 'lhv_bank'
          ? 'This looks like an LHV bank account CSV. Use the Bank Import page instead.'
          : 'Could not detect investment broker format.');
        setStage('error'); return;
      }

      // Step 2: preview
      setStage('previewing');
      const data = await previewInvestmentImport(f);
      setPreview(data); setStage('preview');
    } catch (e) { setError(e.message); setStage('error'); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, maxFiles: 1,
  });

  const handleCommit = async () => {
    setStage('importing');
    try { await commitInvestmentImport(file); setStage('done'); onDone?.(); }
    catch (e) { setError(e.message); setStage('error'); }
  };

  const reset = () => { setStage('drop'); setFile(null); setPreview(null); setDetected(null); setError(null); };

  if (stage === 'done') return (
    <div className="card p-6 text-center">
      <CheckCircle size={36} className="mx-auto text-green-500 mb-3" />
      <p className="text-green-600 font-semibold text-lg mb-2">Import complete!</p>
      <button onClick={reset} className="btn-secondary">Import another file</button>
    </div>
  );

  // Detection result banner
  const DetectionBanner = detected && (
    <div className={clsx('rounded-lg p-3 flex items-start gap-3 mb-3 text-sm',
      detected.confidence >= 0.9
        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    )}>
      {detected.confidence >= 0.9
        ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
        : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
      <div>
        <p className="font-semibold">Detected: {detected.brokerName} ({Math.round(detected.confidence * 100)}% confidence)</p>
        <ul className="mt-1 space-y-0.5 text-xs opacity-80">
          {detected.notes?.map((n, i) => <li key={i}>• {n}</li>)}
        </ul>
      </div>
    </div>
  );

  if (stage === 'preview' && preview) return (
    <div className="card p-5 space-y-4">
      {DetectionBanner}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{preview.filename}</p>
          <p className="text-sm text-gray-400">{preview.summary.dateFrom} → {preview.summary.dateTo}</p>
        </div>
        <div className="flex gap-6 text-center">
          <div><p className="text-2xl font-bold text-green-600">{preview.summary.newCount}</p><p className="text-xs text-gray-400">New</p></div>
          <div><p className="text-2xl font-bold text-gray-400">{preview.summary.duplicateCount}</p><p className="text-xs text-gray-400">Dupes</p></div>
          <div><p className="text-2xl font-bold text-blue-500">{preview.skipped}</p><p className="text-xs text-gray-400">Skipped</p></div>
        </div>
      </div>

      {/* Tickers */}
      {preview.summary.tickers?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.summary.tickers.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400">{t}</span>
          ))}
        </div>
      )}

      {/* Warnings */}
      {preview.warnings?.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
          {preview.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
        </div>
      )}

      <div className="overflow-x-auto max-h-48">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>{['Date','Ticker','Type','Fund/Details','Net Amt','Status'].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {preview.preview?.slice(0, 25).map((tx, i) => (
              <tr key={i} className={clsx(tx.isDuplicate && 'opacity-40')}>
                <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-1.5 font-mono font-medium text-gray-900 dark:text-white">{tx.ticker || '—'}</td>
                <td className="px-3 py-1.5">{tx.type}</td>
                <td className="px-3 py-1.5 text-gray-400 max-w-[140px] truncate">{tx.fundName || tx.rawDetails?.slice(0,40) || '—'}</td>
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{fmt(tx.netAmount, tx.currency)}</td>
                <td className="px-3 py-1.5">
                  {tx.isDuplicate
                    ? <span className="text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">dupe</span>
                    : <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">new</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-secondary">Cancel</button>
        <button onClick={handleCommit} disabled={preview.summary.newCount === 0} className="btn-primary">
          Import {preview.summary.newCount} transactions
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Supported Formats — Auto-detected</p>
        <div className="mt-2 space-y-1">
          {[
            ['LightYear',        'CSV from LightYear.io → Account Statement (comma-delimited)'],
            ['Swedbank Fund',    'CSV from Swedbank Investment Account → Account Statement (semicolon)'],
          ].map(([name, desc]) => (
            <div key={name} className="flex gap-2 text-xs text-blue-600 dark:text-blue-400">
              <span className="font-semibold w-28">{name}</span>
              <span className="opacity-75">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {stage === 'detecting' || stage === 'previewing' ? (
        <div className="card p-8 text-center"><LoadingSpinner /><p className="text-sm text-gray-400 mt-2">{stage === 'detecting' ? 'Detecting broker...' : 'Parsing transactions...'}</p></div>
      ) : (
        <div
          {...getRootProps()}
          className={clsx('card border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-brand-400'
          )}
        >
          <input {...getInputProps()} />
          <Upload size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop investment CSV or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">LightYear or Swedbank Fund — auto-detected</p>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>
      )}
    </div>
  );
}
