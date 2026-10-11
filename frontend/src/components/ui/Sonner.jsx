import * as React from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

function Toaster({ ...props }) {
  const [isDark, setIsDark] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={isDark ? 'dark' : 'light'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white/90 dark:group-[.toaster]:bg-slate-900/90 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-gray-900 dark:group-[.toaster]:text-gray-100 group-[.toaster]:border-black/[0.08] dark:group-[.toaster]:border-white/[0.12] group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl group-[.toaster]:p-3.5',
          description: 'group-[.toast]:text-gray-500 dark:group-[.toast]:text-gray-400 group-[.toast]:text-xs',
          actionButton:
            'group-[.toast]:bg-brand-600 group-[.toast]:hover:bg-brand-700 group-[.toast]:text-white group-[.toast]:font-medium group-[.toast]:rounded-lg group-[.toast]:px-2.5 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:transition-colors',
          cancelButton:
            'group-[.toast]:bg-black/[0.05] dark:group-[.toast]:bg-white/[0.08] group-[.toast]:text-gray-700 dark:group-[.toast]:text-gray-300 group-[.toast]:font-medium group-[.toast]:rounded-lg group-[.toast]:px-2.5 group-[.toast]:py-1.5 group-[.toast]:text-xs',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
