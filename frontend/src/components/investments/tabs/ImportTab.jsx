import InvestmentImport from '../import/InvestmentImport';

export default function ImportTab({ onDone }) {
  return (
    <div className="max-w-2xl">
      <InvestmentImport onDone={onDone} />
    </div>
  );
}
