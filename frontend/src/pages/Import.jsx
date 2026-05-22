import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, CheckCircle, XCircle, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import { previewImport, commitImport } from '../api/client';
import clsx from 'clsx';

const fmt = (n) =>
  new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

export default function Import() {
  const [stage, setStage]       = useState('drop');    // drop | previewing | preview | importing | done | error
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const qc = useQueryClient();

  const onDrop = useCallback(async (accepted) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setStage('previewing');
    try {
      const data = await previewImport(f);
      setPreview(data);
      setStage('preview');
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const handleCommit = async () => {
    setStage('importing');
    try {
      const data = await commitImport(file);
      setResult(data);
      setStage('done');
      // Invalidate all data caches
      qc.invalidateQueries();
    } catch (err) {
      setError(err.message);
      setStage('error');
    }
  };

  const reset = () => {
    setStage('drop');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import Transactions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Upload your LHV bank CSV export — duplicates are detected automatically.
        </p>
      </div>

      {/* Drop zone */}
      {(stage === 'drop' || stage === 'error') && (
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
              : 'border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-900'
          )}
        >
          <input {...getInputProps()} />
          <Upload size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            {isDragActive ? 'Drop your CSV here' : 'Drag & drop your bank CSV export'}
          </p>
          <p className="text-sm text-gray-400 mt-1">or click to browse</p>
          <p className="text-xs text-gray-400 mt-3">
            Supports LHV Bank semicolon-delimited CSV export format
          </p>
          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 text-sm">
              <XCircle size={16} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Previewing spinner */}
      {stage === 'previewing' && (
        <div className="card p-12 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>Analyzing file...</span>
          </div>
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && preview && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="card p-5">
            <div className="flex items-start gap-4">
              <FileText size={20} className="text-brand-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">{preview.filename}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Account: {preview.summary.account} &middot;{' '}
                  {preview.summary.dateFrom} → {preview.summary.dateTo}
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{preview.summary.newCount}</p>
                  <p className="text-xs text-gray-400">New</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-400">{preview.summary.duplicateCount}</p>
                  <p className="text-xs text-gray-400">Duplicates</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-500">{preview.errors?.length ?? 0}</p>
                  <p className="text-xs text-gray-400">Errors</p>
                </div>
              </div>
            </div>
          </div>

          {preview.summary.newCount === 0 && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-3 text-sm">
              <AlertTriangle size={16} />
              All transactions in this file already exist in the database. Nothing new to import.
            </div>
          )}

          {/* Transaction preview table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Preview ({Math.min(preview.preview?.length ?? 0, 50)} of {preview.preview?.length})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Merchant</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {preview.preview?.slice(0, 50).map((tx, i) => (
                    <tr
                      key={i}
                      className={clsx(
                        'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                        tx.isDuplicate && 'opacity-40'
                      )}
                    >
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white max-w-xs truncate">
                        {tx.merchant || tx.beneficiary}
                      </td>
                      <td className={clsx(
                        'px-4 py-2.5 text-right font-medium whitespace-nowrap',
                        tx.direction === 'K'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-white'
                      )}>
                        {tx.direction === 'K' ? '+' : ''}{fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                        {tx.suggestedCategory}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {tx.isDuplicate
                          ? <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">duplicate</span>
                          : <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">new</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={preview.summary.newCount === 0}
              className="btn-primary flex items-center gap-2"
            >
              Import {preview.summary.newCount} new transactions
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {stage === 'importing' && (
        <div className="card p-12 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>Importing transactions...</span>
          </div>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && result && (
        <div className="card p-8 text-center space-y-4">
          <CheckCircle size={48} className="mx-auto text-green-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Import complete!</h2>
          <div className="flex justify-center gap-10 text-center">
            <div>
              <p className="text-3xl font-bold text-green-600">{result.importedCount}</p>
              <p className="text-sm text-gray-400">Imported</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-400">{result.duplicateCount}</p>
              <p className="text-sm text-gray-400">Skipped (dupes)</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-red-500">{result.errorCount}</p>
              <p className="text-sm text-gray-400">Errors</p>
            </div>
          </div>
          <button onClick={reset} className="btn-primary">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
