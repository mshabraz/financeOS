import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownUp, Tag, Moon, Sun, TrendingUp, LineChart, Hash, Settings, UsersRound, CalendarClock, ListTodo,
  LogOut, MoreHorizontal, X, Eye, EyeOff,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../context/AuthContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useOpenBankingAutoSync } from '../../hooks/useOpenBankingAutoSync';
import clsx from 'clsx';
import FinanceLogo from '../ui/FinanceLogo';
import { Switch } from '../ui/Switch';

const PRIMARY_NAV = [
  { to: '/',             icon: LayoutDashboard, label: 'Home' },
  { to: '/transactions', icon: ArrowDownUp,     label: 'Txns' },
  { to: '/analytics',    icon: TrendingUp,      label: 'Stats' },
];

const MORE_NAV = [
  { to: '/investments', icon: LineChart, label: 'Investments' },
  { to: '/due',         icon: CalendarClock, label: 'Due & Owed' },
  { to: '/tasks',       icon: ListTodo, label: 'Tasks' },
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
  { to: '/due',          icon: CalendarClock,     label: 'Due & Owed' },
  { to: '/tasks',        icon: ListTodo,          label: 'Tasks' },
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
            : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]',
          isActive
            ? compact
              ? 'text-brand-600 dark:text-brand-400 font-semibold'
              : 'bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold border border-brand-500/20'
            : compact
              ? 'text-slate-500 dark:text-slate-400'
              : 'text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
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
  const { status, logout, user } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const { syncing: bankAutoSyncing } = useOpenBankingAutoSync(true);

  const isMoreActive = MORE_NAV.some((n) => location.pathname.startsWith(n.to));

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50/50 dark:bg-[#0b0f17]/50">
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-black/[0.06] dark:border-white/[0.07] bg-white/80 dark:bg-[#0b0f17]/80 backdrop-blur-xl">
        <div className="h-14 flex items-center px-4 border-b border-black/[0.06] dark:border-white/[0.07] min-w-0">
          <FinanceLogo variant="full" size={36} className="min-w-0" />
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {DESKTOP_NAV.map(({ to, icon, label }) => (
            <NavItem key={to} to={to} icon={icon} label={label} end={to === '/'} />
          ))}
        </nav>
        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.07] space-y-0.5">
          <div className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
            <span className="flex items-center gap-3">
              {privacyMode ? <EyeOff size={18} className="text-amber-500" /> : <Eye size={18} className="text-slate-400" />}
              <span>Privacy mode</span>
            </span>
            <Switch
              checked={privacyMode}
              onCheckedChange={togglePrivacy}
              aria-label="Toggle privacy mode"
            />
          </div>
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] min-h-[44px] transition-colors"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          {status?.authEnabled && (
            <>
              {user?.email && (
                <p className="px-3 py-1 text-[10px] text-slate-400 truncate" title={user.email}>
                  {user.email}
                  {user.role === 'admin' ? ' · admin' : ''}
                </p>
              )}
              <button
                type="button"
                onClick={() => logout()}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] min-h-[44px] transition-colors"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {bankAutoSyncing && (
          <div
            className="shrink-0 border-b border-brand-500/20 bg-brand-500/10 backdrop-blur-sm px-4 py-1.5 text-center text-xs font-medium text-brand-700 dark:text-brand-300"
            role="status"
          >
            Syncing connected banks…
          </div>
        )}
        <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-5 sm:py-5 lg:p-6 pb-28 lg:pb-6">
            {children}
          </div>
        </main>

        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#0b0f17]/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
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
                isMoreActive || moreOpen ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
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
          <button type="button" className="absolute inset-0 bg-black/40 dark:bg-black/65 backdrop-blur-sm" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-0 inset-x-0 bg-white/90 dark:bg-[#0b0f17]/90 backdrop-blur-2xl rounded-t-2xl border-t border-black/[0.08] dark:border-white/[0.1] pb-[env(safe-area-inset-bottom)] max-h-[70dvh] overflow-y-auto shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <span className="font-semibold text-slate-900 dark:text-white">More</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="p-2 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.08] min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
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
                      'flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium min-h-[48px] touch-manipulation transition-all',
                      isActive
                        ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold border border-brand-500/20'
                        : 'text-slate-700 dark:text-slate-200 active:bg-black/[0.05] dark:active:bg-white/[0.08]'
                    )
                  }
                >
                  <Icon size={22} />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="p-2 pt-0 border-t border-black/[0.06] dark:border-white/[0.08] mt-1 space-y-0.5">
              <div className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-base font-medium text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-3">
                  {privacyMode ? <EyeOff size={22} className="text-amber-500" /> : <Eye size={22} className="text-slate-400" />}
                  <span>Privacy mode</span>
                </span>
                <Switch
                  checked={privacyMode}
                  onCheckedChange={togglePrivacy}
                  aria-label="Toggle privacy mode"
                />
              </div>
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-base font-medium text-slate-700 dark:text-slate-200 min-h-[48px] active:bg-black/[0.05] dark:active:bg-white/[0.08] transition-colors"
              >
                {dark ? <Sun size={22} /> : <Moon size={22} />}
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
              {status?.authEnabled && (
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); logout(); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-base font-medium text-slate-700 dark:text-slate-200 min-h-[48px] active:bg-black/[0.05] dark:active:bg-white/[0.08] transition-colors"
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
