import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Layout       from './components/layout/Layout';
import Login        from './pages/Login';
import Dashboard    from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Analytics    from './pages/Analytics';
import Categories   from './pages/Categories';
import Settings     from './pages/Settings';
import Tags         from './pages/Tags';
import Investments from './pages/Investments';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
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
          <Route path="/tags"         element={<Tags />} />
          <Route path="/categories"   element={<Categories />} />
          <Route path="/settings"     element={<Settings />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
