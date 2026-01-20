import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, Upload, X, FileText, Image, Eye, Edit2, Trash2, ExternalLink, Download, Clipboard } from 'lucide-react';
import { Modal } from '../Modal';

interface PettyCashDocument {
  id: string;
  file_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_at?: string;
  created_at?: string;
}

interface PettyCashTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'withdraw' | 'expense';
  amount: number;
  description: string;
  expense_category: string | null;
  bank_account_id: string | null;
  paid_to: string | null;
  paid_by_staff_id: string | null;
  paid_by_staff_name: string | null;
  source: string | null;
  received_by_staff_id: string | null;
  received_by_staff_name: string | null;
  bank_accounts?: { account_name: string; bank_name: string } | null;
  created_at: string;
  petty_cash_documents?: PettyCashDocument[];
}

interface PettyCashManagerProps {
  canManage: boolean;
}

const expenseCategories = [
  'Office Supplies',
  'Transportation',
  'Meals & Entertainment',
  'Postage & Courier',
  'Cleaning & Maintenance',
  'Utilities',
  'Miscellaneous',
];

// Map petty cash categories to finance_expenses valid categories (used when bank-paid expense is created)
const mapPettyCashCategoryToFinance = (category: string): string => {
  const mapping: { [key: string]: string } = {
    'Office Supplies': 'office_admin',
    'Transportation': 'other',
    'Meals & Entertainment': 'other',
    'Postage & Courier': 'other',
    'Cleaning & Maintenance': 'other',
    'Utilities': 'utilities',
    'Miscellaneous': 'other',
  };
  return mapping[category] || 'other';
};

interface PettyCashManagerProps {
  canManage: boolean;
  onNavigateToFundTransfer?: () => void;
}

export function PettyCashManager({ canManage, onNavigateToFundTransfer }: PettyCashManagerProps) {
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<PettyCashTransaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<PettyCashTransaction | null>(null);
  const [cashBalance, setCashBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{file: File, type: string}[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showPasteHint, setShowPasteHint] = useState(false);

  const [formData, setFormData] = useState({
    transaction_type: 'expense' as 'withdraw' | 'expense',
    transaction_date: new Date().toISOString().split('T')[0],
    amount: 0,
    description: '',
    expense_category: '',
    bank_account_id: '',
    paid_to: '',
    paid_by_staff_name: '',
    paid_by: 'cash' as 'cash' | 'bank',
    source: '',
    received_by_staff_name: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [txRes, balanceRes] = await Promise.all([
        supabase
          .from('petty_cash_transactions')
          .select(`
            *,
            bank_accounts(account_name, bank_name),
            petty_cash_documents(id, file_type, file_name, file_url, file_size, created_at)
          `)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('petty_cash_transactions')
          .select('transaction_type, amount'),
      ]);

      if (txRes.error) throw txRes.error;

      setTransactions(txRes.data || []);

      if (balanceRes.error) {
        console.error('Error fetching balance data:', balanceRes.error);
      } else {
        const allTransactions = balanceRes.data || [];
        const balance = allTransactions.reduce((sum, tx) => {
          if (tx.transaction_type === 'withdraw') {
            return sum + Number(tx.amount);
          } else {
            return sum - Number(tx.amount);
          }
        }, 0);
        setCashBalance(balance);
      }
    } catch (error) {
      console.error('Error loading petty cash:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Paste handler for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!modalOpen) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const fileName = `pasted-image-${Date.now()}.png`;
            const file = new File([blob], fileName, { type: blob.type });
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        const newFiles = pastedFiles.map(file => ({ file, type: 'photo' }));
        setUploadingFiles(prev => [...prev, ...newFiles]);
        setShowPasteHint(true);
        setTimeout(() => setShowPasteHint(false), 2000);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [modalOpen, uploadingFiles]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const generateTransactionNumber = async (type: 'withdraw' | 'expense') => {
    const prefix = type === 'withdraw' ? 'PCW' : 'PCE';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const { count } = await supabase
      .from('petty_cash_transactions')
      .select('*', { count: 'exact', head: true })
      .like('transaction_number', `${prefix}${year}${month}%`);
    
    return `${prefix}${year}${month}-${String((count || 0) + 1).padStart(4, '0')}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, fileType: string) => {
    console.log('=== FILE SELECTED ===');
    console.log('File type:', fileType);

    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({ file, type: fileType }));
      console.log('Files selected:', newFiles.map(f => ({ name: f.file.name, size: f.file.size, type: f.type })));

      setUploadingFiles(prev => {
        const updated = [...prev, ...newFiles];
        console.log('Total files to upload:', updated.length);
        return updated;
      });
    }
  };

  const removeFile = (index: number) => {
    setUploadingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    if (formData.transaction_type === 'expense' && formData.paid_by === 'cash' && formData.amount > cashBalance) {
      alert('Insufficient cash balance. Please add funds first.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // If expense is paid by bank, create finance_expense instead
      if (formData.transaction_type === 'expense' && formData.paid_by === 'bank') {
        // Map petty cash category to valid finance_expenses category
        const mappedCategory = mapPettyCashCategoryToFinance(formData.expense_category || 'Miscellaneous');

        const expenseData = {
          expense_category: mappedCategory,
          expense_type: 'admin',
          amount: formData.amount,
          expense_date: formData.transaction_date,
          description: `${formData.description} (Paid to: ${formData.paid_to}, Category: ${formData.expense_category || 'Miscellaneous'})`,
          payment_method: 'bank_transfer',
          bank_account_id: formData.bank_account_id || null,
          paid_by: 'bank',
          created_by: user.id,
        };

        const { error: expenseError } = await supabase
          .from('finance_expenses')
          .insert([expenseData]);

        if (expenseError) throw expenseError;

        alert('Expense moved to Expense Tracker for Bank Reconciliation');
        setModalOpen(false);
        resetForm();
        loadData();
        return;
      }

      // Otherwise, create or update petty cash transaction
      let transaction;

      if (editingTransaction) {
        // Update existing transaction
        const payload: any = {
          transaction_date: formData.transaction_date,
          amount: formData.amount,
          description: formData.description,
          paid_by: formData.paid_by,
        };

        if (formData.transaction_type === 'expense') {
          payload.expense_category = formData.expense_category || null;
          payload.paid_to = formData.paid_to || null;
          payload.paid_by_staff_name = formData.paid_by_staff_name || null;
        } else {
          payload.bank_account_id = formData.bank_account_id || null;
          payload.source = formData.source || null;
          payload.received_by_staff_name = formData.received_by_staff_name || null;
        }

        const { data, error } = await supabase
          .from('petty_cash_transactions')
          .update(payload)
          .eq('id', editingTransaction.id)
          .select()
          .single();

        if (error) throw error;
        transaction = data;
      } else {
        // Create new transaction
        const transactionNumber = await generateTransactionNumber(formData.transaction_type);

        const payload: any = {
          transaction_number: transactionNumber,
          transaction_date: formData.transaction_date,
          transaction_type: formData.transaction_type,
          amount: formData.amount,
          description: formData.description,
          paid_by: formData.paid_by,
          created_by: user.id,
        };

        if (formData.transaction_type === 'expense') {
          payload.expense_category = formData.expense_category || null;
          payload.paid_to = formData.paid_to || null;
          payload.paid_by_staff_name = formData.paid_by_staff_name || null;
        } else {
          payload.bank_account_id = formData.bank_account_id || null;
          payload.source = formData.source || null;
          payload.received_by_staff_name = formData.received_by_staff_name || null;
        }

        const { data, error } = await supabase
          .from('petty_cash_transactions')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        transaction = data;
      }

      // Upload files if any
      if (uploadingFiles.length > 0 && transaction) {
        console.log('=== UPLOADING FILES TO PETTY CASH ===');
        console.log('Transaction ID:', transaction.id);
        console.log('Files to upload:', uploadingFiles.length);

        for (const { file, type } of uploadingFiles) {
          console.log('Uploading file:', file.name, 'Type:', type);

          const fileExt = file.name.split('.').pop();
          const fileName = `${transaction.id}/${Date.now()}_${type}.${fileExt}`;

          console.log('Storage path:', fileName);

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('petty-cash-receipts')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            alert(`Failed to upload ${file.name}: ${uploadError.message}`);
          } else {
            console.log('Upload successful:', uploadData);

            const { data: urlData } = supabase.storage
              .from('petty-cash-receipts')
              .getPublicUrl(fileName);

            console.log('Public URL:', urlData.publicUrl);

            if (urlData) {
              const { error: dbError } = await supabase.from('petty_cash_documents').insert({
                petty_cash_transaction_id: transaction.id,
                file_type: type,
                file_name: file.name,
                file_url: urlData.publicUrl,
                file_size: file.size,
                uploaded_by: user.id,
              });

              if (dbError) {
                console.error('Database insert error:', dbError);
              } else {
                console.log('Document record saved to database');
              }
            }
          }
        }

        console.log('All files processed');
      }

      // Fetch the complete transaction with relations
      const { data: completeTransaction, error: fetchError } = await supabase
        .from('petty_cash_transactions')
        .select(`
          *,
          bank_accounts(account_name, bank_name),
          petty_cash_documents(id, file_type, file_name, file_url, file_size, created_at)
        `)
        .eq('id', transaction.id)
        .single();

      if (fetchError) {
        console.error('Error fetching complete transaction:', fetchError);
      } else {
        // Update state in-place
        if (editingTransaction) {
          setTransactions(prev => prev.map(t =>
            t.id === transaction.id ? completeTransaction : t
          ));
          // Recalculate balance
          const balanceRes = await supabase
            .from('petty_cash_transactions')
            .select('transaction_type, amount');
          if (balanceRes.data) {
            const balance = balanceRes.data.reduce((acc, t) =>
              t.transaction_type === 'withdraw' ? acc + t.amount : acc - t.amount, 0
            );
            setCashBalance(balance);
          }
        } else {
          setTransactions(prev => [completeTransaction, ...prev]);
          // Update balance
          setCashBalance(prev =>
            formData.transaction_type === 'withdraw' ? prev + formData.amount : prev - formData.amount
          );
        }
      }

      setModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving transaction:', error);
      alert('Failed to save: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      transaction_type: 'expense',
      transaction_date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
      expense_category: '',
      bank_account_id: '',
      paid_to: '',
      paid_by_staff_name: '',
      paid_by: 'cash',
      source: '',
      received_by_staff_name: '',
    });
    setUploadingFiles([]);
    setEditingTransaction(null);
  };

  const handleView = (transaction: PettyCashTransaction) => {
    setViewingTransaction(transaction);
    setViewModalOpen(true);
  };

  const handleEdit = (transaction: PettyCashTransaction) => {
    setEditingTransaction(transaction);
    setFormData({
      transaction_type: transaction.transaction_type,
      transaction_date: transaction.transaction_date,
      amount: transaction.amount,
      description: transaction.description,
      expense_category: transaction.expense_category || '',
      bank_account_id: transaction.bank_account_id || '',
      paid_to: transaction.paid_to || '',
      paid_by_staff_name: transaction.paid_by_staff_name || '',
      paid_by: transaction.bank_account_id ? 'bank' : 'cash',
      source: transaction.source || '',
      received_by_staff_name: transaction.received_by_staff_name || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('petty_cash_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Get the transaction amount before deleting from state
      const deletedTransaction = transactions.find(t => t.id === id);

      // Remove from local state
      setTransactions(prev => prev.filter(t => t.id !== id));

      // Update balance
      if (deletedTransaction) {
        setCashBalance(prev =>
          deletedTransaction.transaction_type === 'withdraw'
            ? prev - deletedTransaction.amount
            : prev + deletedTransaction.amount
        );
      }

      alert('Transaction deleted successfully');
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction: ' + error.message);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cash Balance Card */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-6 h-6" />
              <span className="text-green-100 font-medium">Petty Cash Balance</span>
            </div>
            <div className="text-4xl font-bold">
              Rp {cashBalance.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-green-100 text-sm mt-2">
              Available for cash expenses
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 bg-white text-green-600 px-4 py-2 rounded-lg hover:bg-green-50 font-medium transition"
              >
                <Plus className="w-5 h-5" />
                New Entry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <ArrowDownCircle className="w-5 h-5" />
            <span className="font-medium">Funds Added</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            Rp {transactions
              .filter(t => t.transaction_type === 'withdraw')
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-sm text-gray-500">Total withdrawn from bank</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <ArrowUpCircle className="w-5 h-5" />
            <span className="font-medium">Expenses Paid</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            Rp {transactions
              .filter(t => t.transaction_type === 'expense')
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-sm text-gray-500">Total spent from petty cash</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th onClick={() => { let dir: 'asc' | 'desc' = 'asc'; if (sortConfig?.key === 'transaction_date' && sortConfig.direction === 'asc') dir = 'desc'; setSortConfig({ key: 'transaction_date', direction: dir }); }} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center gap-1">Date{sortConfig?.key === 'transaction_date' && <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Txn No</th>
                <th onClick={() => { let dir: 'asc' | 'desc' = 'asc'; if (sortConfig?.key === 'transaction_type' && sortConfig.direction === 'asc') dir = 'desc'; setSortConfig({ key: 'transaction_type', direction: dir }); }} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center gap-1">Type{sortConfig?.key === 'transaction_type' && <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div></th>
                <th onClick={() => { let dir: 'asc' | 'desc' = 'asc'; if (sortConfig?.key === 'description' && sortConfig.direction === 'asc') dir = 'desc'; setSortConfig({ key: 'description', direction: dir }); }} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center gap-1">Description{sortConfig?.key === 'description' && <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid To / Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
                <th onClick={() => { let dir: 'asc' | 'desc' = 'asc'; if (sortConfig?.key === 'amount' && sortConfig.direction === 'asc') dir = 'desc'; setSortConfig({ key: 'amount', direction: dir }); }} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center justify-end gap-1">Debit (In){sortConfig?.key === 'amount' && <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}</div></th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit (Out)</th>
                {canManage && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...transactions].sort((a, b) => { if (!sortConfig) return 0; const { key, direction } = sortConfig; let aVal: any = a[key as keyof PettyCashTransaction]; let bVal: any = b[key as keyof PettyCashTransaction]; if (key === 'transaction_date') { aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime(); } else if (key === 'amount') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; } else if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); } if (aVal < bVal) return direction === 'asc' ? -1 : 1; if (aVal > bVal) return direction === 'asc' ? 1 : -1; return 0; }).map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    {new Date(tx.transaction_date).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{tx.transaction_number}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      tx.transaction_type === 'withdraw' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {tx.transaction_type === 'withdraw' ? (
                        <>
                          <ArrowDownCircle className="w-3 h-3" />
                          Add Funds
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="w-3 h-3" />
                          Expense
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div>{tx.description}</div>
                    {tx.expense_category && (
                      <span className="text-xs text-gray-500">{tx.expense_category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tx.transaction_type === 'expense' ? tx.paid_to : tx.source}
                    {tx.bank_accounts && (
                      <span className="text-xs block text-gray-400">
                        {tx.bank_accounts.account_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tx.transaction_type === 'expense' 
                      ? tx.paid_by_staff_name 
                      : tx.received_by_staff_name}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">
                    {tx.transaction_type === 'withdraw' ? `Rp ${tx.amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {tx.transaction_type === 'expense' ? `Rp ${tx.amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleView(tx)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(tx)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {/* Totals Row */}
              {transactions.length > 0 && (
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right text-gray-900">
                    TOTAL ({transactions.length} transactions):
                  </td>
                  <td className="px-4 py-3 text-right text-blue-700 font-bold">
                    Rp {transactions.filter(t => t.transaction_type === 'withdraw').reduce((sum, t) => sum + t.amount, 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700 font-bold">
                    Rp {transactions.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + t.amount, 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {canManage && <td></td>}
                </tr>
              )}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="px-4 py-12 text-center text-gray-500">
                    <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No transactions yet</p>
                    <p className="text-sm mt-1">Click "New Entry" to add funds or record an expense</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editingTransaction ? 'Edit Petty Cash Entry' : 'Petty Cash Entry'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type Tabs */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, transaction_type: 'withdraw' })}
              disabled={!!editingTransaction}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md transition ${
                formData.transaction_type === 'withdraw'
                  ? 'bg-green-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ArrowDownCircle className="w-5 h-5" />
              Add Funds (Income)
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, transaction_type: 'expense' })}
              disabled={!!editingTransaction}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md transition ${
                formData.transaction_type === 'expense'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-200'
              } ${editingTransaction ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ArrowUpCircle className="w-5 h-5" />
              Add Expense
            </button>
          </div>

          {formData.transaction_type === 'withdraw' ? (
            /* Add Funds - Redirect to Fund Transfer */
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <Wallet className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Use Fund Transfer to Add Money</h3>
              <p className="text-sm text-blue-700 mb-4">
                To maintain proper accounting records, petty cash funding must come from a bank account via Fund Transfer.
                This creates the correct journal entry (Dr Petty Cash, Cr Bank) and enables bank reconciliation.
              </p>
              <div className="bg-white border border-blue-300 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm font-medium text-gray-900 mb-2">How it works:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>1. Go to <strong>Fund Transfers</strong> in the Finance menu</li>
                  <li>2. Create a new transfer: <strong>Bank → Petty Cash</strong></li>
                  <li>3. The amount will automatically appear here as incoming funds</li>
                  <li>4. Bank statement can be linked during reconciliation</li>
                </ul>
              </div>
              {onNavigateToFundTransfer && (
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    onNavigateToFundTransfer();
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Wallet className="w-5 h-5" />
                  Go to Fund Transfers
                </button>
              )}
            </div>
          ) : (
            /* Add Expense Form */
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-700 mb-1">Record a new petty cash expense with receipt details</p>
              <p className="text-xs text-orange-600 mb-4">Available Balance: Rp {cashBalance.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rp) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={cashBalance}
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.transaction_date}
                    onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid To *</label>
                  <input
                    type="text"
                    required
                    value={formData.paid_to}
                    onChange={(e) => setFormData({ ...formData, paid_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    placeholder="Vendor/Person name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid By (Staff) *</label>
                  <input
                    type="text"
                    required
                    value={formData.paid_by_staff_name}
                    onChange={(e) => setFormData({ ...formData, paid_by_staff_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    placeholder="Staff member name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Source *</label>
                  <select
                    value={formData.paid_by}
                    onChange={(e) => setFormData({ ...formData, paid_by: e.target.value as 'cash' | 'bank' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-medium"
                    required
                  >
                    <option value="cash">💵 Cash (→ Petty Cash)</option>
                    <option value="bank">🏦 Bank (→ Expense Tracker)</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    {formData.paid_by === 'cash'
                      ? '✓ Will be recorded in Petty Cash'
                      : '✓ Will move to Expense Tracker for Bank Reconciliation'}
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose / Description *</label>
                  <textarea
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    rows={2}
                    placeholder="For what purpose?"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.expense_category}
                    onChange={(e) => setFormData({ ...formData, expense_category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* File Attachments */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Attachments (Optional)
            </h4>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Proof Attachment
                </label>
                <label
                  className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition relative"
                  onMouseEnter={() => setShowPasteHint(true)}
                  onMouseLeave={() => setShowPasteHint(false)}
                >
                  <FileText className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">Upload</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileSelect(e, 'proof')}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Bill/Invoice
                </label>
                <label
                  className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition relative"
                  onMouseEnter={() => setShowPasteHint(true)}
                  onMouseLeave={() => setShowPasteHint(false)}
                >
                  <FileText className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">Upload</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileSelect(e, 'invoice')}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Material Photo
                </label>
                <label
                  className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition relative"
                  onMouseEnter={() => setShowPasteHint(true)}
                  onMouseLeave={() => setShowPasteHint(false)}
                >
                  <Image className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">Upload</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(e, 'photo')}
                  />
                </label>
              </div>
            </div>

            {showPasteHint && (
              <div className="flex items-center justify-center gap-2 text-xs text-green-600 font-medium animate-pulse mt-2 py-2 bg-green-50 rounded-lg">
                <Clipboard className="w-4 h-4" />
                <span>Press Ctrl+V to paste images from clipboard (saved as Material Photo)</span>
              </div>
            )}

            {uploadingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {uploadingFiles.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg text-sm">
                    <span className="text-xs text-gray-500 uppercase">{item.type}</span>
                    <span className="truncate max-w-32">{item.file.name}</span>
                    <button type="button" onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => { setModalOpen(false); resetForm(); }}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2 text-white rounded-lg transition ${
                formData.transaction_type === 'withdraw'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {editingTransaction
                ? 'Update Transaction'
                : formData.transaction_type === 'withdraw'
                ? 'Add Funds'
                : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Transaction Modal */}
      {viewingTransaction && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => {
            setViewModalOpen(false);
            setViewingTransaction(null);
          }}
          title="Transaction Details"
          size="lg"
        >
          <div className="space-y-6">
            {/* Transaction Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">
                    {viewingTransaction.transaction_number}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(viewingTransaction.transaction_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  viewingTransaction.transaction_type === 'withdraw'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {viewingTransaction.transaction_type === 'withdraw' ? (
                    <>
                      <ArrowDownCircle className="w-4 h-4" />
                      Add Funds
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="w-4 h-4" />
                      Expense
                    </>
                  )}
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                Rp {viewingTransaction.amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Transaction Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium uppercase">Description</label>
                  <p className="text-sm text-gray-900 mt-1">{viewingTransaction.description}</p>
                </div>
                {viewingTransaction.expense_category && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Category</label>
                    <p className="text-sm text-gray-900 mt-1">{viewingTransaction.expense_category}</p>
                  </div>
                )}
                {viewingTransaction.transaction_type === 'expense' && viewingTransaction.paid_to && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Paid To</label>
                    <p className="text-sm text-gray-900 mt-1">{viewingTransaction.paid_to}</p>
                  </div>
                )}
                {viewingTransaction.transaction_type === 'withdraw' && viewingTransaction.source && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Source</label>
                    <p className="text-sm text-gray-900 mt-1">{viewingTransaction.source}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {viewingTransaction.bank_accounts && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Bank Account</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {viewingTransaction.bank_accounts.bank_name} - {viewingTransaction.bank_accounts.account_name}
                    </p>
                  </div>
                )}
                {viewingTransaction.transaction_type === 'expense' && viewingTransaction.paid_by_staff_name && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Paid By (Staff)</label>
                    <p className="text-sm text-gray-900 mt-1">{viewingTransaction.paid_by_staff_name}</p>
                  </div>
                )}
                {viewingTransaction.transaction_type === 'withdraw' && viewingTransaction.received_by_staff_name && (
                  <div>
                    <label className="text-xs text-gray-500 font-medium uppercase">Received By (Staff)</label>
                    <p className="text-sm text-gray-900 mt-1">{viewingTransaction.received_by_staff_name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attached Documents */}
            {viewingTransaction.petty_cash_documents && viewingTransaction.petty_cash_documents.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Attached Documents ({viewingTransaction.petty_cash_documents.length})
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {viewingTransaction.petty_cash_documents.map((doc) => {
                    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(doc.file_name);
                    return (
                      <div
                        key={doc.id}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              {isImage ? (
                                <Image className="w-8 h-8 text-blue-600" />
                              ) : (
                                <FileText className="w-8 h-8 text-gray-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {doc.file_name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {doc.file_type} • {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="View"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <a
                              href={doc.file_url}
                              download={doc.file_name}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                        {isImage && (
                          <div className="mt-2">
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={doc.file_url}
                                alt={doc.file_name}
                                className="w-full max-w-md rounded-lg border-2 border-gray-300 hover:border-blue-400 cursor-pointer shadow-sm hover:shadow-md transition-all"
                                style={{ maxHeight: '300px', objectFit: 'contain' }}
                              />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(!viewingTransaction.petty_cash_documents || viewingTransaction.petty_cash_documents.length === 0) && (
              <div className="border-t pt-4">
                <div className="text-center py-6 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents attached</p>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              {canManage && (
                <>
                  <button
                    onClick={() => {
                      setViewModalOpen(false);
                      handleEdit(viewingTransaction);
                    }}
                    className="px-4 py-2 text-green-600 border border-green-300 rounded-lg hover:bg-green-50 transition flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setViewModalOpen(false);
                      handleDelete(viewingTransaction.id);
                    }}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setViewModalOpen(false);
                  setViewingTransaction(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
