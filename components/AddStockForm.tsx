
import React, { useState, useMemo } from 'react';
import { InventoryItemId, View, Transaction, InventoryState, AppSettings } from '../types';
import { INVENTORY_ITEMS } from '../constants';

type ItemLine = {
    id: number;
    itemId: InventoryItemId | '';
    quantity: string;
    stockId: string;
    notes: string;
}

interface AddStockFormProps {
  addStock: (vendorPO: string, date: string, items: Array<{itemId: InventoryItemId, quantity: number, stockId: string, notes: string}>) => void;
  setView: (view: View) => void;
  inventory: InventoryState;
  transactions: Transaction[];
  settings: AppSettings;
}

const AddStockForm: React.FC<AddStockFormProps> = ({ addStock, setView, inventory, transactions }) => {
  const [vendorPO, setVendorPO] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ItemLine[]>([
      { id: Date.now(), itemId: '', quantity: '', stockId: '', notes: '' }
  ]);
  
  const handleItemChange = (id: number, field: keyof Omit<ItemLine, 'id'>, value: string) => {
      setItems(prevItems => prevItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  
  const handleAddItem = () => {
      setItems(prevItems => [...prevItems, { id: Date.now(), itemId: '', quantity: '', stockId: '', notes: '' }]);
  };
  
  const handleRemoveItem = (id: number) => {
      setItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = items.filter(item => item.itemId && item.quantity && parseFloat(item.quantity) > 0)
                            .map(item => ({
                                itemId: item.itemId as InventoryItemId,
                                quantity: parseFloat(item.quantity),
                                stockId: item.stockId,
                                notes: item.notes
                            }));

    if (validItems.length > 0 && date) {
      addStock(vendorPO, date, validItems);
      setView('stockHistory');
    } else {
      alert('Please add at least one valid item with an item type and quantity.');
    }
  };
  
  // Aggregate impact summary
  const impactSummary = useMemo(() => {
    const summaryMap: Record<string, { name: string; unit: string; current: number; adding: number; next: number }> = {};

    items.forEach(item => {
        if (!item.itemId || !item.quantity) return;
        const itemInfo = INVENTORY_ITEMS.find(i => i.id === item.itemId);
        if (!itemInfo) return;

        const qty = parseFloat(item.quantity) || 0;

        if (!summaryMap[item.itemId]) {
            summaryMap[item.itemId] = {
                name: itemInfo.name,
                unit: itemInfo.unit,
                current: inventory[item.itemId as InventoryItemId] || 0,
                adding: 0,
                next: 0
            };
        }
        summaryMap[item.itemId].adding += qty;
    });

    // Calculate final totals
    Object.values(summaryMap).forEach(entry => {
        entry.next = entry.current + entry.adding;
    });

    return Object.values(summaryMap);
  }, [items, inventory]);

  // Helper to get recent stock IDs for a specific item
  const getRecentStockIds = (itemId: InventoryItemId | '') => {
      if (!itemId) return [];
      
      const recentIds: string[] = [];
      const seen = new Set<string>();

      // Iterate backwards through transactions to find recent IN records for this item
      for (let i = 0; i < transactions.length; i++) {
          const tx = transactions[i];
          if (tx.type === 'IN') {
              tx.details.forEach(d => {
                  if (d.itemId === itemId) {
                      // Check for specific Stock ID (new format)
                      if (d.stockId && !seen.has(d.stockId)) {
                          recentIds.push(d.stockId);
                          seen.add(d.stockId);
                      } 
                      // Fallback to Order Number (legacy format) if no stock ID on detail, and it looks like a stock ID (not a PO)
                      // This is a heuristic: Legacy entries usually had orderNumber as the Lot #.
                      else if (!d.stockId && tx.orderNumber && !seen.has(tx.orderNumber)) {
                           // Basic check to assume it might be a stock ID if it's short, but let's just include it to be safe
                           recentIds.push(tx.orderNumber);
                           seen.add(tx.orderNumber);
                      }
                  }
              });
          }
          if (recentIds.length >= 5) break;
      }
      return recentIds;
  };

  return (
    <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Add Incoming Stock</h2>
        
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                        <label htmlFor="vendorPO" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vendor PO Number (Optional)</label>
                        <input
                            type="text"
                            id="vendorPO"
                            value={vendorPO}
                            onChange={(e) => setVendorPO(e.target.value)}
                            className="mt-1 block w-full input-base"
                            placeholder="e.g., VENDOR-12345"
                        />
                    </div>
                    <div>
                        <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date Received</label>
                        <input
                            type="date"
                            id="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="mt-1 block w-full input-base"
                            required
                        />
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Received Items</h3>
                {items.map((item, index) => {
                    const recentIds = getRecentStockIds(item.itemId);
                    return (
                    <div key={item.id} className="grid grid-cols-12 gap-x-4 gap-y-4 items-start p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600">
                        {/* Item Select */}
                        <div className="col-span-12 md:col-span-4">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Item*</label>
                            <select
                                value={item.itemId}
                                onChange={(e) => handleItemChange(item.id, 'itemId', e.target.value)}
                                className="mt-1 block w-full input-sm-base"
                                required
                            >
                                <option value="" disabled>Select an item</option>
                                {INVENTORY_ITEMS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                            {/* Recent IDs Hint */}
                            {recentIds.length > 0 && (
                                <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                    <span className="font-semibold">Recent IDs:</span> {recentIds.join(', ')}
                                </div>
                            )}
                        </div>
                        {/* Quantity */}
                         <div className="col-span-6 md:col-span-2">
                             <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity*</label>
                             <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                step="any" min="0.0001"
                                className="mt-1 block w-full input-sm-base"
                                required
                             />
                         </div>
                         {/* Stock ID */}
                         <div className="col-span-6 md:col-span-2">
                             <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Stock ID</label>
                             <input
                                type="text"
                                value={item.stockId}
                                onChange={(e) => handleItemChange(item.id, 'stockId', e.target.value)}
                                className="mt-1 block w-full input-sm-base font-mono"
                                placeholder="e.g., M34"
                             />
                         </div>
                         {/* Notes */}
                          <div className="col-span-10 md:col-span-3">
                             <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Notes</label>
                             <input
                                type="text"
                                value={item.notes}
                                onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                                className="mt-1 block w-full input-sm-base"
                             />
                         </div>
                         {/* Remove Button */}
                         <div className="col-span-2 md:col-span-1 flex justify-end pt-5 md:pt-6">
                            {items.length > 1 && (
                                <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            )}
                         </div>
                    </div>
                )})}
                <div className="pt-2">
                    <button type="button" onClick={handleAddItem} className="px-3 py-1.5 text-sm font-medium text-brand-red border border-brand-red rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">
                        + Add Another Item
                    </button>
                </div>
            </div>

            {impactSummary.length > 0 && (
                <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">Inventory Impact Summary</h3>
                    <div className="space-y-2">
                        {impactSummary.map(impact => (
                           <div key={impact.name} className="grid grid-cols-4 gap-4 text-sm items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                               <div className="col-span-2 font-medium text-gray-700 dark:text-gray-200">{impact.name}</div>
                               <div className="text-right text-gray-500 dark:text-gray-400 font-mono">
                                   {impact.current.toLocaleString(undefined, {maximumFractionDigits: 2})}
                               </div>
                               <div className="text-right text-green-600 dark:text-green-400 font-mono font-bold">
                                   + {impact.adding.toLocaleString(undefined, {maximumFractionDigits: 2})}
                               </div>
                           </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="flex justify-end space-x-4">
                <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
                    Cancel
                </button>
                <button type="submit" className="px-6 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700">
                    Add Stock
                </button>
            </div>
        </form>
        <style>{`
            .input-base {
                display: block; width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; line-height: 1.25rem; border: 1px solid #D1D5DB; border-radius: 0.375rem;
            }
            .dark .input-base { background-color: #374151; border-color: #4B5563; color: #FFFFFF; }
            .input-base:focus { outline: 2px solid transparent; outline-offset: 2px; border-color: #B11E31; }
             .input-sm-base {
                display: block; width: 100%; padding: 0.25rem 0.5rem; font-size: 0.875rem; line-height: 1.25rem; border-width: 1px; border-color: #D1D5DB; border-radius: 0.375rem;
            }
            .dark .input-sm-base { background-color: #374151; border-color: #4B5563; color: #FFFFFF; }
        `}</style>
    </div>
  );
};

export default AddStockForm;
