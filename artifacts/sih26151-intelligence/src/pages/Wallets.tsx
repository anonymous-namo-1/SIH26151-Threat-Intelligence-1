import { Wallet as WalletIcon, ArrowRightLeft, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { mockWallets, mockTransactions, mockActors } from '@/data/mock';

export function Wallets() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cryptocurrency Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">Track illicit fund flows, actor wallets, and exposure risks.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {mockWallets.map(wallet => {
          const actor = mockActors.find(a => a.id === wallet.relatedActorId);
          const txs = mockTransactions.filter(t => t.walletId === wallet.id);
          
          return (
            <div key={wallet.id} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-border bg-muted/10">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <WalletIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{wallet.currency}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          wallet.riskScore > 90 ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-warning/10 text-warning-foreground border border-warning/20'
                        }`}>
                          RISK: {wallet.riskScore}/100
                        </span>
                      </div>
                      <div className="text-sm font-mono mt-1 tracking-tight">{wallet.address}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-background border border-border rounded p-3">
                    <div className="text-xs text-muted-foreground mb-1">Balance</div>
                    <div className="font-mono font-medium">{wallet.balance} {wallet.currency}</div>
                  </div>
                  <div className="bg-background border border-border rounded p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <ArrowDownRight className="w-3 h-3 text-chart-5" /> Received
                    </div>
                    <div className="font-mono font-medium">{wallet.totalReceived} {wallet.currency}</div>
                  </div>
                  <div className="bg-background border border-border rounded p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3 text-destructive" /> Sent
                    </div>
                    <div className="font-mono font-medium">{wallet.totalSent} {wallet.currency}</div>
                  </div>
                </div>

                {actor && (
                  <div className="text-xs flex items-center gap-2 bg-background border border-border p-2 rounded">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Attributed to: <span className="font-medium text-foreground">{actor.name}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 p-0">
                <div className="px-5 py-3 border-b border-border bg-background">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Recent Transactions
                  </h4>
                </div>
                <div className="divide-y divide-border">
                  {txs.length > 0 ? txs.map(tx => (
                    <div key={tx.id} className="p-4 bg-background hover:bg-muted/30 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${tx.type === 'INBOUND' ? 'bg-chart-5/10 text-chart-5' : 'bg-destructive/10 text-destructive'}`}>
                          {tx.type === 'INBOUND' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-mono text-sm font-medium">{tx.amount} {wallet.currency}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5" title={tx.txHash}>
                            {tx.txHash.slice(0, 16)}...
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium bg-muted px-2 py-1 rounded inline-block">
                          {tx.exposure}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {tx.timestamp.split('T')[0]}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="p-5 text-center text-sm text-muted-foreground">No recent transactions indexed.</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
