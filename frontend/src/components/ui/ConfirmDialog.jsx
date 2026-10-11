import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import { Button } from './Button';

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel?.(); }}>
      <DialogContent className="max-w-md p-6">
        <div className="flex items-start gap-4">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              isDestructive
                ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400'
                : 'text-brand-600 bg-brand-50 dark:bg-brand-950/40 dark:text-brand-400'
            }`}
          >
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 space-y-1">
            <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              {message}
            </DialogDescription>
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} type="button">
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
