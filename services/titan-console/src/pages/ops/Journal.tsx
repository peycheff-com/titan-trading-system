import { useState, useEffect } from 'react';
import { DenseTable } from '@/components/titan/DenseTable';
import { RowDetailDrawer, DetailSection, DetailRow } from '@/components/titan/RowDetailDrawer';
import { formatTimestamp, formatCurrency } from '@/types';
import { useTitanData } from '@/hooks/useTitanData';
import { cn } from '@/lib/utils';
import { BookOpen, Filter, Tag } from 'lucide-react';

const typeConfig: any = {
  trade: { color: 'text-primary', bg: 'bg-primary/10' },
  system: { color: 'text-muted-foreground', bg: 'bg-muted' },
  incident: { color: 'text-status-critical', bg: 'bg-status-critical/10' },
};

export default function JournalPage() {
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  // In a real implementation, we would fetch from /api/console/trades or /api/console/journal
  
  useEffect(() => {
    // Placeholder for data fetching logic
    // const fetchJournal = async () => { ... }
    setJournalEntries([]); 
  }, []);

  const filteredEntries = typeFilter === 'all'
    ? journalEntries
    : journalEntries.filter((e) => e.type === typeFilter);

  const handleRowClick = (entry: any) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Journal & Forensics</h1>
            <p className="text-sm text-muted-foreground">
              Trade history, system events, and forensic analysis
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
        >
          <option value="all">All Types</option>
          <option value="trade">Trades</option>
          <option value="system">System</option>
          <option value="incident">Incidents</option>
        </select>
      </div>

      {/* Journal Table */}
      <DenseTable
        columns={[
          {
            key: 'timestamp',
            header: 'Time',
            render: (entry) => (
              <span className="text-muted-foreground">
                {formatTimestamp(entry.timestamp)}
              </span>
            ),
          },
          {
            key: 'type',
            header: 'Type',
            render: (entry) => (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xxs font-medium capitalize',
                  typeConfig[entry.type].bg,
                  typeConfig[entry.type].color
                )}
              >
                {entry.type}
              </span>
            ),
          },
          {
            key: 'symbol',
            header: 'Symbol',
            render: (entry) => entry.symbol || '—',
          },
          { key: 'action', header: 'Action' },
          {
            key: 'price',
            header: 'Price',
            align: 'right',
            render: (entry) => (entry.price ? formatCurrency(entry.price) : '—'),
          },
          {
            key: 'pnl',
            header: 'PnL',
            align: 'right',
            render: (entry) =>
              entry.pnl !== null ? (
                <span
                  className={cn(
                    'font-mono',
                    entry.pnl >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
                  )}
                >
                  {formatCurrency(entry.pnl)}
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'notes',
            header: 'Notes',
            render: (entry) => (
              <span className="truncate text-muted-foreground" style={{ maxWidth: 200 }}>
                {entry.notes}
              </span>
            ),
          },
        ]}
        data={filteredEntries}
        keyExtractor={(entry) => entry.id}
        onRowClick={handleRowClick}
        selectedKey={selectedEntry?.id}
        maxHeight="500px"
      />

      {/* Detail Drawer */}
      <RowDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Journal Entry"
      >
        {selectedEntry && (
          <div className="space-y-6">
            <DetailSection title="Entry Details">
              <DetailRow label="Time" value={new Date(selectedEntry.timestamp).toLocaleString()} />
              <DetailRow
                label="Type"
                value={
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xxs font-medium capitalize',
                      typeConfig[selectedEntry.type].bg,
                      typeConfig[selectedEntry.type].color
                    )}
                  >
                    {selectedEntry.type}
                  </span>
                }
              />
              {selectedEntry.symbol && (
                <DetailRow label="Symbol" value={selectedEntry.symbol} />
              )}
              <DetailRow label="Action" value={selectedEntry.action} />
            </DetailSection>

            {selectedEntry.type === 'trade' && (
              <DetailSection title="Trade Details">
                {selectedEntry.price && (
                  <DetailRow label="Price" value={formatCurrency(selectedEntry.price)} />
                )}
                {selectedEntry.qty && (
                  <DetailRow label="Quantity" value={selectedEntry.qty} />
                )}
                {selectedEntry.pnl !== null && (
                  <DetailRow
                    label="PnL"
                    value={
                      <span
                        className={cn(
                          'font-mono',
                          selectedEntry.pnl >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
                        )}
                      >
                        {formatCurrency(selectedEntry.pnl)}
                      </span>
                    }
                  />
                )}
              </DetailSection>
            )}

            <DetailSection title="Notes">
              <p className="text-sm text-foreground">{selectedEntry.notes}</p>
            </DetailSection>

            <DetailSection title="Tags">
              <div className="flex flex-wrap gap-1">
                {selectedEntry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xxs text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </DetailSection>
          </div>
        )}
      </RowDetailDrawer>
    </div>
  );
}
