import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from './lib/idbPersister';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { PrivacyProvider } from './context/PrivacyContext';
import Layout       from './components/layout/Layout';
import Login        from './pages/Login';
import Dashboard    from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Analytics    from './pages/Analytics';
import CategoriesAndTags from './pages/CategoriesAndTags';
import Settings     from './pages/Settings';
import Investments from './pages/Investments';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { Toaster } from './components/ui/Sonner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours retention
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

persistQueryClient({
  queryClient,
  persister: createIDBPersister(),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== 'success') return false;
      const key = query.queryKey;
      const root = key[0];

      // Exclude transient auth or live status checks
      if (root === 'authStatus' || root === 'session' || root === 'invPriceSync') {
        return false;
      }

      // Avoid hoarding unbounded paginated transaction queries in cache
      if (root === 'transactions') {
        const page = key[1];
        return page === 1 || page === undefined;
      }

      return true;
    },
  },
});

function AppRoutes() {
  const { loading, needsAuth } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (needsAuth) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/import"       element={<Navigate to="/transactions?tab=import" replace />} />
          <Route path="/analytics"    element={<Analytics />} />
          <Route path="/revolut" element={<Navigate to="/transactions?tab=import" replace />} />
          <Route path="/investments"  element={<Investments />} />
          <Route path="/goals" element={<Navigate to="/investments?tab=planner&planner=tracking" replace />} />
          <Route path="/categories"   element={<CategoriesAndTags />} />
          <Route path="/tags"         element={<Navigate to="/categories?tab=tags" replace />} />
          <Route path="/settings"     element={<Settings />} />
          <Route path="/shared/*"     element={<Navigate to="/" replace />} />
          <Route path="/due"          element={<Navigate to="/" replace />} />
          <Route path="/obligations"  element={<Navigate to="/" replace />} />
          <Route path="/tasks"        element={<Navigate to="/" replace />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrivacyProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="bottom-right" closeButton />
          </BrowserRouter>
        </AuthProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </StrictMode>
);
