import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit, Trash2, Search, Eye, X } from 'lucide-react';
import { Modal } from '../Modal';

interface Supplier {
  id: string;
  company_name: string;
  npwp: string | null;
  pkp_status: boolean;
}

interface Product {
  id: string;
  product_name: string;
  unit: string;
  current_stock: number;
}

interface PurchaseInvoiceItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  narration: string;
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  suppliers?: { company_name: string };
}

interface PurchaseInvoiceManagerProps {
  canManage: boolean;
}

export function PurchaseInvoiceManager({ canManage }: PurchaseInvoiceManagerProps) {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    invoice_number: '',
    supplier_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency: 'IDR',
    exchange_rate: 1,
    tax_percent: 0,
    notes: '',
  });

  const [lineItems, setLineItems] = useState<PurchaseInvoiceItem[]>([
    {
      product_id: '',
      product_name: '',
      unit: '',
      quantity: 1,
      rate: 0,
      amount: 0,
      narration: ''
    }
  ]);

  useEffect(() => {
    loadInvoices();
    loadSuppliers();
    loadProducts();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers (company_name)
        `)
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, product_name, unit, current_stock')
        .eq('is_active', true)
        .order('product_name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const handleAddLine = () => {
    setLineItems([
      ...lineItems,
      {
        product_id: '',
        product_name: '',
        unit: '',
        quantity: 1,
        rate: 0,
        amount: 0,
        narration: ''
      }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleLineChange = (index: number, field: keyof PurchaseInvoiceItem, value: any) => {
    const newLines = [...lineItems];

    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newLines[index].product_id = value;
        newLines[index].product_name = product.product_name;
        newLines[index].unit = product.unit;
        newLines[index].narration = product.product_name;
      }
    } else if (field === 'quantity' || field === 'rate') {
      newLines[index][field] = parseFloat(value) || 0;
      newLines[index].amount = newLines[index].quantity * newLines[index].rate;
    } else {
      newLines[index][field] = value;
    }

    setLineItems(newLines);
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = (subtotal * formData.tax_percent) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManage) {
      alert('You do not have permission to create purchase invoices');
      return;
    }

    if (!formData.supplier_id) {
      alert('Please select a supplier');
      return;
    }

    if (lineItems.length === 0 || lineItems.every(item => item.amount === 0)) {
      alert('Please add at least one line item');
      return;
    }

    // Validate
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.product_id) {
        alert(`Line ${i + 1}: Please select a product`);
        return;
      }
      if (item.quantity <= 0) {
        alert(`Line ${i + 1}: Quantity must be greater than 0`);
        return;
      }
      if (item.rate <= 0) {
        alert(`Line ${i + 1}: Rate must be greater than 0`);
        return;
      }
    }

    const totals = calculateTotals();

    try {
      const { data: userData } = await supabase.auth.getUser();

      const invoiceData = {
        invoice_number: formData.invoice_number.trim(),
        supplier_id: formData.supplier_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date || null,
        currency: formData.currency,
        exchange_rate: formData.exchange_rate,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        total_amount: totals.total,
        paid_amount: 0,
        balance_amount: totals.total,
        status: 'unpaid',
        notes: formData.notes.trim() || null,
        created_by: userData.user?.id,
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from('purchase_invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert line items
      const itemsToInsert = lineItems.map(item => ({
        invoice_id: invoice.id,
        item_type: 'inventory',
        product_id: item.product_id,
        description: item.narration,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.rate,
        line_total: item.amount,
        tax_amount: 0,
        expense_account_id: null,
        asset_account_id: null
      }));

      const { error: itemsError } = await supabase
        .from('purchase_invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      alert('Purchase invoice created successfully');
      setModalOpen(false);
      resetForm();
      await loadInvoices();
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      supplier_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'IDR',
      exchange_rate: 1,
      tax_percent: 0,
      notes: '',
    });
    setLineItems([{
      product_id: '',
      product_name: '',
      unit: '',
      quantity: 1,
      rate: 0,
      amount: 0,
      narration: ''
    }]);
  };

  const totals = calculateTotals();
  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.suppliers?.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Purchase Invoices</h2>
        {canManage && (
          <button
            onClick={() => {
              resetForm();
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Purchase Invoice
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search by invoice number or supplier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.suppliers?.company_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                    {invoice.currency} {invoice.total_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span className={invoice.balance_amount > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      {invoice.currency} {invoice.balance_amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      invoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : invoice.status === 'partial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button className="text-blue-600 hover:text-blue-900">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title="New Purchase Invoice"
        maxWidth="max-w-7xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Section */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier *
              </label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number *
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date *
              </label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({
                  ...formData,
                  currency: e.target.value,
                  exchange_rate: e.target.value === 'IDR' ? 1 : formData.exchange_rate
                })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {formData.currency === 'USD' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exchange Rate *
                </label>
                <input
                  type="number"
                  value={formData.exchange_rate}
                  onChange={(e) => setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) || 1 })}
                  min="1"
                  step="0.01"
                  required
                  placeholder="15750"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Line
              </button>
            </div>

            <div className="space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {/* Product */}
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Product *
                      </label>
                      <select
                        value={item.product_id}
                        onChange={(e) => handleLineChange(index, 'product_id', e.target.value)}
                        required
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.product_name} (Stock: {product.current_stock})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unit (Display Only) */}
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={item.unit}
                        disabled
                        className="w-full px-2 py-1.5 text-sm border rounded bg-gray-50 text-gray-600"
                      />
                    </div>

                    {/* Qty */}
                    <div className="w-28">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Qty *
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                        min="0.01"
                        step="0.01"
                        required
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Rate */}
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Rate *
                      </label>
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => handleLineChange(index, 'rate', e.target.value)}
                        min="0"
                        step="0.01"
                        required
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Amount (Display Only) */}
                    <div className="w-36">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Amount
                      </label>
                      <input
                        type="text"
                        value={item.amount.toLocaleString()}
                        disabled
                        className="w-full px-2 py-1.5 text-sm border rounded bg-gray-50 text-gray-900 font-medium text-right"
                      />
                    </div>

                    {/* Remove Button */}
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        className="mt-5 text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Narration - Full Width */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Narration
                    </label>
                    <input
                      type="text"
                      value={item.narration}
                      onChange={(e) => handleLineChange(index, 'narration', e.target.value)}
                      placeholder="Additional description..."
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Section */}
          <div className="border-t pt-6">
            <div className="flex justify-end">
              <div className="w-96 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Subtotal:</span>
                  <span className="text-sm font-medium">
                    {formData.currency} {totals.subtotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center gap-4">
                  <label className="text-sm text-gray-600">Tax %:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formData.tax_percent}
                      onChange={(e) => setFormData({ ...formData, tax_percent: parseFloat(e.target.value) || 0 })}
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-20 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm">%</span>
                    <span className="text-sm font-medium w-32 text-right">
                      {formData.currency} {totals.taxAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t pt-3">
                  <span className="text-base font-semibold text-gray-900">Total:</span>
                  <span className="text-lg font-bold text-blue-600">
                    {formData.currency} {totals.total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Invoice
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
