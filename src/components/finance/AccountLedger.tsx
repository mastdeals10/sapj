import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFinance } from '../../contexts/FinanceContext';
import { Search, Printer, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface AccountLedger {
  id: string;
  line_number: number;
  journal_entry_id: string;
  entry_date: string;
  entry_number: string;
  source_module: string | null;
  reference_number: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
}

export function AccountLedger() {
  const { dateRange } = useFinance();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [ledgerData, setLedgerData] = useState<AccountLedger[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      loadLedger();
    }
  }, [selectedAccount, dateRange]);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('is_active', true)
        .eq('is_header', false)
        .order('code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async () => {
    if (!selectedAccount) return;

    try {
      setLoading(true);

      // Get opening balance (all transactions before start date)
      const { data: openingData, error: openingError } = await supabase
        .from('journal_entry_lines')
        .select('debit, credit, journal_entries!inner(entry_date)')
        .eq('account_id', selectedAccount.id)
        .lt('journal_entries.entry_date', dateRange.startDate);

      if (openingError) throw openingError;

      let opening = 0;
      openingData?.forEach((line: any) => {
        if (selectedAccount.normal_balance === 'debit') {
          opening += line.debit - line.credit;
        } else {
          opening += line.credit - line.debit;
        }
      });
      setOpeningBalance(opening);

      // Get transactions in date range
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          *,
          journal_entries!inner(
            id,
            entry_number,
            entry_date,
            source_module,
            reference_number
          )
        `)
        .eq('account_id', selectedAccount.id)
        .gte('journal_entries.entry_date', dateRange.startDate)
        .lte('journal_entries.entry_date', dateRange.endDate)
        .order('line_number');

      if (error) {
        console.error('Error loading ledger:', error);
        throw error;
      }

      // Sort by date and line number client-side since PostgREST doesn't support ordering by foreign table fields
      const sortedData = (data || []).sort((a: any, b: any) => {
        const dateA = new Date(a.journal_entries.entry_date).getTime();
        const dateB = new Date(b.journal_entries.entry_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.line_number - b.line_number;
      });

      // Calculate running balance
      let runningBalance = opening;
      const ledgerWithBalance = sortedData.map((line: any) => {
        const entry = line.journal_entries;

        // Update balance based on account type
        if (selectedAccount.normal_balance === 'debit') {
          runningBalance += (line.debit - line.credit);
        } else {
          runningBalance += (line.credit - line.debit);
        }

        return {
          id: line.id,
          line_number: line.line_number,
          journal_entry_id: entry.id,
          entry_date: entry.entry_date,
          entry_number: entry.entry_number,
          source_module: entry.source_module,
          reference_number: entry.reference_number,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          balance: runningBalance,
        };
      });

      setLedgerData(ledgerWithBalance);
    } catch (error) {
      console.error('Error loading ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredAccounts = accounts.filter(acc =>
    acc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closingBalance = ledgerData.length > 0 ? ledgerData[ledgerData.length - 1].balance : openingBalance;

  const totals = ledgerData.reduce(
    (acc, line) => ({
      debit: acc.debit + line.debit,
      credit: acc.credit + line.credit,
    }),
    { debit: 0, credit: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Account Selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search account by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <select
          value={selectedAccount?.id || ''}
          onChange={(e) => {
            const account = accounts.find(a => a.id === e.target.value);
            setSelectedAccount(account || null);
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg min-w-[300px]"
        >
          <option value="">Select Account...</option>
          {filteredAccounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.code} - {acc.name}
            </option>
          ))}
        </select>

        {selectedAccount && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        )}
      </div>

      {!selectedAccount && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium mb-2">Select an account to view its ledger</p>
          <p className="text-blue-600 text-sm mb-4">
            Use the dropdown above to choose an account, or search by code or name.
          </p>
          <div className="bg-white border border-blue-200 rounded p-3 text-left max-w-md mx-auto">
            <p className="text-sm text-gray-700 mb-1">
              <span className="font-semibold">Tip:</span> To view all journal entries across all accounts:
            </p>
            <p className="text-sm text-blue-700">
              Go to <span className="font-mono bg-blue-100 px-2 py-0.5 rounded">Journal Register</span> in the Books menu (Ctrl+J)
            </p>
          </div>
        </div>
      )}

      {selectedAccount && (
        <>
          {/* Ledger Header */}
          <div className="bg-white border rounded-lg p-4 print:border-0">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Account Ledger</h2>
              <h3 className="text-lg font-medium mt-1">
                {selectedAccount.code} - {selectedAccount.name}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Period: {new Date(dateRange.startDate).toLocaleDateString('id-ID')} to {new Date(dateRange.endDate).toLocaleDateString('id-ID')}
              </p>
            </div>

            {/* Opening Balance */}
            <div className="flex justify-between items-center py-2 border-t border-b font-medium bg-gray-50 px-3">
              <span>Opening Balance:</span>
              <span className={openingBalance >= 0 ? 'text-green-600' : 'text-red-600'}>
                Rp {Math.abs(openingBalance).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {openingBalance < 0 && ' (Cr)'}
              </span>
            </div>

            {/* Ledger Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Voucher No</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Debit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Credit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Balance</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Narration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {ledgerData.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(line.entry_date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-blue-600">
                        {line.entry_number}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs bg-gray-100 rounded">
                          {line.source_module || 'Manual'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-blue-600">
                        {line.debit > 0 ? `Rp ${line.debit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-green-600">
                        {line.credit > 0 ? `Rp ${line.credit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                        <span className={line.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          Rp {Math.abs(line.balance).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs max-w-xs truncate">
                        {line.description || line.reference_number || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right">Total:</td>
                    <td className="px-3 py-2 text-right text-blue-700">
                      Rp {totals.debit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">
                      Rp {totals.credit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right">Closing Balance:</td>
                    <td className="px-3 py-2 text-right">
                      <span className={closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
                        Rp {Math.abs(closingBalance).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {closingBalance < 0 && ' (Cr)'}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {ledgerData.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-500">
                No transactions found for this account in the selected period.
              </div>
            )}
          </div>
        </>
      )}

      {!selectedAccount && !loading && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
          <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p>Select an account to view its ledger</p>
        </div>
      )}
    </div>
  );
}

function BookOpen(props: any) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
