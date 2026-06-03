import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  getInvestmentHoldings, getInvestmentDividends,
  getInvestmentValuations, getInvestmentAnalytics, getInvestmentPriceSyncStatus,
  triggerInvestmentPriceSync, clearInvestmentBinding, clearAutoInvestmentBindings,
} from '../api/client';
import PortfolioOverview from '../components/investments/PortfolioOverview';
import PriceSyncCompact from '../components/investments/PriceSyncCompact';
import CompoundPlanner from '../components/investments/CompoundPlanner';
import InvestmentsChrome from '../components/investments/InvestmentsChrome';
import HoldingsTab from '../components/investments/tabs/HoldingsTab';
import DividendsTab from '../components/investments/tabs/DividendsTab';
import HistoryTab from '../components/investments/tabs/HistoryTab';
import ImportTab from '../components/investments/tabs/ImportTab';
import InvestmentLedger from '../components/investments/ledger/InvestmentLedger';
import { getImportHistory } from '../components/investments/investmentPageApi';
import { usePrivacy } from '../context/PrivacyContext';

export default function Investments() {
  usePrivacy();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const plannerView = searchParams.get('planner');
  const [tab, setTab] = useState(
    ['overview', 'holdings', 'ledger', 'dividends', 'planner', 'history', 'import'].includes(initialTab)
      ? initialTab
      : 'overview',
  );
  const [brokerFilter, setBrokerFilter] = useState('');
  const [perfPeriod, setPerfPeriod] = useState('1Y');
  const [allocView, setAllocView] = useState('topHoldings');

  const holdings = useQuery({
    queryKey: ['invHoldings', brokerFilter],
    queryFn: () => getInvestmentHoldings(brokerFilter),
  });
  const valuations = useQuery({
    queryKey: ['invValuations', brokerFilter],
    queryFn: () => getInvestmentValuations(brokerFilter),
    refetchInterval: 60_000,
    retry: 2,
  });
  const analytics = useQuery({
    queryKey: ['invAnalytics', brokerFilter, perfPeriod],
    queryFn: () => getInvestmentAnalytics({
      ...(brokerFilter ? { broker: brokerFilter } : {}),
      period: perfPeriod,
    }),
    refetchInterval: 120_000,
    retry: 1,
    staleTime: 30_000,
    enabled: tab === 'overview',
  });
  const syncStatus = useQuery({
    queryKey: ['invPriceSync'],
    queryFn: getInvestmentPriceSyncStatus,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : 30_000),
  });
  const syncMut = useMutation({
    mutationFn: triggerInvestmentPriceSync,
    onSuccess: () => {
      ['invPriceSync', 'invValuations', 'invAnalytics', 'invBrokerCash', 'assets'].forEach((k) => {
        qc.invalidateQueries({ queryKey: [k] });
      });
    },
  });
  const unbindMut = useMutation({
    mutationFn: (h) => clearInvestmentBinding({ broker: h.broker, ticker: h.ticker, currency: h.currency }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invValuations'] }),
  });
  const clearAutoMut = useMutation({
    mutationFn: clearAutoInvestmentBindings,
    onSuccess: () => refreshValuation(),
  });
  const dividends = useQuery({
    queryKey: ['invDividends', brokerFilter],
    queryFn: () => getInvestmentDividends(brokerFilter),
  });
  const importHistory = useQuery({
    queryKey: ['importHistory'],
    queryFn: getImportHistory,
    enabled: tab === 'history',
  });

  const openHoldings = holdings.data?.filter((h) => !h.fullyExited) ?? [];
  const closedHoldings = holdings.data?.filter((h) => h.fullyExited && h.totalProceeds > 0) ?? [];
  const valuedOpen = valuations.data?.openHoldings ?? [];
  const marketOpen = valuedOpen.length > 0 ? valuedOpen : openHoldings;
  const valuationsFailed = valuations.isError;
  const valuationsPartial = !valuations.isLoading && !valuations.isError && valuedOpen.length === 0 && openHoldings.length > 0;

  const invalidateAll = () => {
    ['invHoldings', 'invValuations', 'invAnalytics', 'invPriceSync', 'invDividends', 'importHistory', 'invTx', 'assets'].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] }),
    );
  };

  const refreshValuation = () => {
    ['invValuations', 'invAnalytics', 'invPriceSync', 'assets'].forEach((k) => {
      qc.invalidateQueries({ queryKey: [k] });
    });
  };

  const isPlannerTab = tab === 'planner';
  const syncing = syncMut.isPending || syncStatus.data?.running;

  return (
    <div className={clsx('space-y-5 sm:space-y-6', isPlannerTab && 'space-y-4')}>
      <InvestmentsChrome
        tab={tab}
        onTabChange={setTab}
        brokerFilter={brokerFilter}
        onBrokerChange={setBrokerFilter}
        hideBroker={isPlannerTab}
        compact={isPlannerTab}
      />

      {tab === 'overview' && (
        <PortfolioOverview
          analytics={analytics.data}
          isLoading={analytics.isLoading}
          isError={analytics.isError}
          errorMessage={analytics.error?.message}
          period={perfPeriod}
          onPeriodChange={setPerfPeriod}
          allocationView={allocView}
          onAllocationViewChange={setAllocView}
          brokerFilter={brokerFilter}
          onOpenHoldings={() => setTab('holdings')}
          priceSyncBar={
            <PriceSyncCompact
              syncStatus={syncStatus}
              syncing={syncing}
              onSync={() => syncMut.mutate()}
              onClearAutoLinks={() => clearAutoMut.mutate()}
              clearingAuto={clearAutoMut.isPending}
            />
          }
        />
      )}

      {tab === 'planner' && (
        <CompoundPlanner brokerFilter={brokerFilter} plannerView={plannerView} />
      )}

      {tab === 'holdings' && (
        <HoldingsTab
          brokerFilter={brokerFilter}
          syncStatus={syncStatus}
          syncing={syncing}
          onSync={() => syncMut.mutate()}
          onClearAutoLinks={() => clearAutoMut.mutate()}
          clearingAuto={clearAutoMut.isPending}
          valuations={valuations}
          valuationsFailed={valuationsFailed}
          valuationsPartial={valuationsPartial}
          openHoldings={openHoldings}
          marketOpen={marketOpen}
          valuedOpen={valuedOpen}
          closedHoldings={closedHoldings}
          refreshValuation={refreshValuation}
          onUnbind={(h) => unbindMut.mutate(h)}
        />
      )}

      {tab === 'ledger' && <InvestmentLedger brokerFilter={brokerFilter} />}

      {tab === 'dividends' && (
        <DividendsTab dividends={dividends.data} brokerFilter={brokerFilter} />
      )}

      {tab === 'history' && (
        <HistoryTab importHistory={importHistory} brokerFilter={brokerFilter} />
      )}

      {tab === 'import' && (
        <ImportTab onDone={() => { invalidateAll(); setTab('overview'); }} />
      )}
    </div>
  );
}
