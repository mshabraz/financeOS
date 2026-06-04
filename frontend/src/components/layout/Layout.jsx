import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownUp, Tag, Moon, Sun, TrendingUp, LineChart, Hash, Settings, UsersRound,
  LogOut, MoreHorizontal, X, Eye, EyeOff,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import { usePrivacy } from '../../context/PrivacyContext';
import clsx from 'clsx';
import FinanceLogo from '../ui/FinanceLogo';

const PRIMARY_NAV = [
  { to: '/',             icon: LayoutDashboard, label: 'Home' },
  { to: '/transactions', icon: ArrowDownUp,     label: 'Txns' },
  { to: '/analytics',    icon: TrendingUp,      label: 'Stats' },
];

const MORE_NAV = [
  { to: '/investments', icon: LineChart, label: 'Investments' },
  { to: '/shared',      icon: UsersRound, label: 'Shared' },
  { to: '/tags',        icon: Hash,      label: 'Tags' },
  { to: '/categories',  icon: Tag,       label: 'Categories' },
  { to: '/settings',    icon: Settings,  label: 'Settings' },
];

const DESKTOP_NAV = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowDownUp,     label: 'Transactions' },
  { to: '/analytics',    icon: TrendingUp,      label: 'Analytics' },
  { to: '/investments',  icon: LineChart,       label: 'Investments' },
  { to: '/shared',       icon: UsersRound,      label: 'Shared Expenses' },
  { to: '/tags',         icon: Hash,            label: 'Tags' },
  { to: '/categories',   icon: Tag,             label: 'Categories' },
  { to: '/settings',     icon: Settings,        label: 'Settings' },
];

function NavItem({ to, icon: Icon, label, end, onClick, compact }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          compact
            ? 'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1 min-h-[52px] touch-manipulation'
            : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
          isActive
            ? compact
              ? 'text-brand-600 dark:text-brand-400'
              : 'bg-brand-50 dark:bg-brand-600/10 text-brand-700 dark:text-brand-400'
            : compact
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        )
      }
    >
      <Icon size={compact ? 22 : 18} />
      <span className={clsx(compact && 'text-[10px] font-medium leading-tight truncate max-w-full px-0.5')}>
        {label}
      </span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { dark, toggle } = useTheme();
  const { status, logout } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  const isMoreActive = MORE_NAV.some((n) => location.pathname.startsWith(n.to));

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-950">
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-800 min-w-0">
          <FinanceLogo variant="full" size={36} className="min-w-0" />
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {DESKTOP_NAV.map(({ to, icon, label }) => (
            <NavItem key={to} to={to} icon={icon} label={label} end={to === '/'} />
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
          <button
            type="button"
            onClick={togglePrivacy}
            className={clsx(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium min-h-[44px]',
              privacyMode
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
            title={privacyMode ? 'Show amounts and account details' : 'Hide amounts and account details'}
          >
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
            {privacyMode ? 'Privacy on' : 'Privacy off'}
          </button>
          <button type="button" onClick={toggle} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px]">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          {status?.authEnabled && (
            <button type="button" onClick={() => logout()} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px]">
              <LogOut size={18} />
              Sign out
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-5 sm:py-5 lg:p-6 pb-28 lg:pb-6">
            {children}
          </div>
        </main>

        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
          aria-label="Main navigation"
        >
          <div className="flex items-stretch justify-around max-w-lg mx-auto">
            {PRIMARY_NAV.map(({ to, icon, label }) => (
              <NavItem key={to} to={to} icon={icon} label={label} end={to === '/'} compact />
            ))}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1 min-h-[52px] touch-manipulation',
                isMoreActive || moreOpen ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </nav>
      </div>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-0 inset-x-0 bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)] max-h-[70dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-gray-900 dark:text-white">More</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={20} />
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              {MORE_NAV.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium min-h-[48px] touch-manipulation',
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-600/10 text-brand-700 dark:text-brand-400'
                        : 'text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800'
                    )
                  }
                >
                  <Icon size={22} />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="p-2 pt-0 border-t border-gray-100 dark:border-gray-800 mt-1 space-y-0.5">
              <button
                type="button"
                onClick={togglePrivacy}
                className={clsx(
                  'flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-base font-medium min-h-[48px] active:bg-gray-100 dark:active:bg-gray-800',
                  privacyMode
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                    : 'text-gray-700 dark:text-gray-200'
                )}
              >
                {privacyMode ? <EyeOff size={22} /> : <Eye size={22} />}
                {privacyMode ? 'Privacy on' : 'Privacy off'}
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-base font-medium text-gray-700 dark:text-gray-200 min-h-[48px] active:bg-gray-100 dark:active:bg-gray-800"
              >
                {dark ? <Sun size={22} /> : <Moon size={22} />}
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
              {status?.authEnabled && (
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); logout(); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-base font-medium text-gray-700 dark:text-gray-200 min-h-[48px] active:bg-gray-100 dark:active:bg-gray-800"
                >
                  <LogOut size={22} />
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
