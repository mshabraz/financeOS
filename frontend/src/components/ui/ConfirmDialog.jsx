import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from './AlertDialog';

export default function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  const isDestructive = variant === 'danger' || variant === 'destructive';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel?.(); }}>
      <AlertDialogContent className="max-w-md p-6">
        <div className="flex items-start gap-4">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              isDestructive
                ? 'text-rose-600 bg-rose-500/10 dark:text-rose-400'
                : 'text-brand-600 bg-brand-500/10 dark:text-brand-400'
            }`}
          >
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 space-y-1">
            <AlertDialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              {message}
            </AlertDialogDescription>
          </div>
        </div>
        <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
          <AlertDialogCancel onClick={onCancel} type="button">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            className={isDestructive ? 'bg-rose-600 hover:bg-rose-700 text-white' : undefined}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
