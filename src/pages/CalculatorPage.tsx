import { Lightning } from '@phosphor-icons/react';
import { BreakevenCalculator } from '@/components/BreakevenCalculator';
import type { Account, Security } from '@/engine/types';

interface CalculatorPageProps {
  accounts: Account[];
  defaultAccountId?: string;
  securities: Security[];
  onOpenNewTrade: (mode?: 'single' | 'pair') => void;
}

export function CalculatorPage({
  accounts,
  defaultAccountId,
  securities,
  onOpenNewTrade,
}: CalculatorPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">回補損平試算</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            先賣後買當沖與回補試算，計入券商手續費折數、低消、證交稅與台股 Tick 檔位
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenNewTrade('pair')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 transition-colors"
        >
          <Lightning size={15} weight="fill" aria-hidden="true" />
          <span>先賣後買成對單</span>
        </button>
      </div>

      <BreakevenCalculator
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        securities={securities}
      />
    </div>
  );
}
