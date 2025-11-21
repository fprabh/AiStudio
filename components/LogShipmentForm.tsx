
import React, { useState, useMemo } from 'react';
import { ProductId, View, Customer, ProductState, Transaction, LotState } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogShipmentFormProps {
  logShipment: (productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string, lotAllocations?: Record<string, number>) => void;
  setView: (view: View) => void;
  inventory: ProductState; // Passed as generic 'inventory' prop, but maps to productInventory in App.tsx
  transactions: Transaction[];
  lotState: LotState;
  settings: ReturnType<typeof useInventory>['settings'];
}

const LogShipmentForm: React.FC<LogShipmentFormProps> = ({ logShipment, setView, inventory: productInventory, transactions, lotState }) => {
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [productId, setProductId] = useState<ProductId | ''>('');
  const [cartons, setCartons] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Lot Allocation State (Map of LotNumber -> Quantity)
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

  // Get all production lots for the selected product that have remaining stock
  const availableLots = useMemo(() => {
      if (!productId) return [];
      
      // 1. Find relevant production transactions
      const productionTxs = transactions.filter(
          t => t.type === 'PRODUCTION' && t.productId === productId && t.orderNumber
      );

      // 2. Aggregate duplicate lots (same lot number, different dates/entries)
      const uniqueLots = new Map<string, string>(); // Lot -> Earliest Date
      productionTxs.forEach(t => {
          const lot = t.orderNumber!;
          const current = uniqueLots.get(lot);
          // Keep earliest date for sorting
          if (!current || new Date(t.date) < new Date(current)) {
              uniqueLots.set(lot, t.date);
          }
      });

      // 3. Build result using aggregated lotState
      const aggregated = Array.from(uniqueLots.entries()).map(([lot, date]) => {
          return {
              lot,
              date,
              remaining: lotState[lot] || 0
          };
      }).filter(l => l.remaining > 0);
      
      // 4. Sort by Lot Number Sequence (Low to High), then by Date
      return aggregated.sort((a, b) => {
          const getSeq = (str: string) => {
              const match = str.match(/(\d+)$/);
              return match ? parseInt(match[0], 10) : 0;
          };
          const seqA = getSeq(a.lot);
          const seqB = getSeq(b.lot);
          
          // Primary Sort: Numeric Sequence
          if (seqA !== 0 && seqB !== 0 && seqA !== seqB) {
              return seqA - seqB;
          }
          
          // Fallback 1: String Comparison (Natural)
          if (a.lot !== b.lot) {
              return a.lot.localeCompare(b.lot, undefined, { numeric: true });
          }

          // Fallback 2: Date (Oldest First)
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [productId, transactions, lotState]);

  const currentStock = productId ? (productInventory[productId] || 0) : 0;
  const cartonsNum = parseFloat(cartons) || 0;
  const remainingStock = currentStock - cartonsNum;
  const isShortage = remainingStock < 0;
  
  const totalAllocated = Object.values(allocations).reduce((sum, qty) => sum + qty, 0);
  const unallocated = Math.max(0, cartonsNum - totalAllocated);

  const handleAllocationChange = (lotNumber: string, val: string) => {
      const qty = parseFloat(val);
      if (isNaN(qty) || qty <= 0) {
          const newAlloc = { ...allocations };
          delete newAlloc[lotNumber];
          setAllocations(newAlloc);
      } else {
          setAllocations(prev => ({ ...prev, [lotNumber]: qty }));
      }
  };

  const handleAutoFill = () => {
      if (cartonsNum <= 0) return;
      
      const newAllocations: Record<string, number> = {};
      let remainingToFill = cartonsNum;

      for (const lot of availableLots) {
          if (remainingToFill <= 0) break;
          
          const take = Math.min(remainingToFill, lot.remaining);
          if (take > 0) {
              newAllocations[lot.lot] = take;
              remainingToFill -= take;
          }
      }
      setAllocations(newAllocations);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productId && cartons && cartonsNum > 0 && date) {
      logShipment(productId, cartonsNum, orderNumber, date, Object.keys(allocations).length > 0 ? allocations : undefined);
      setView('transactions');
    } else {
      alert('Please fill all required fields.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log Shipment</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">Record a shipment leaving the warehouse. Deduct from specific lots (optional).</p>
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="customer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer</label>
              <select id="customer" value={customer} onChange={e => { setCustomer(e.target.value as Customer); setProductId(''); setAllocations({}); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="" disabled>Select a customer</option>
                <option value="PHSA">PHSA</option>
                <option value="PADM">PADM</option>
                <option value="Alliance">Alliance</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="product" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Shipped</label>
              <select id="product" value={productId} onChange={e => { setProductId(e.target.value as ProductId); setAllocations({}); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={!customer}>
                <option value="" disabled>Select a product</option>
                {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            <div>
                <label htmlFor="cartons" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Total Cartons Shipped</label>
                <input type="number" id="cartons" value={cartons} onChange={e => setCartons(e.target.value)} min="1" className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>

             <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipment Date</label>
              <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            
             {productId && (
                <div className="md:col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Total In Stock:</span>
                        <span className="font-mono font-medium text-gray-900 dark:text-white">{currentStock} cartons</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Remaining after Shipment:</span>
                        <span className={`font-mono font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>{remainingStock} cartons</span>
                    </div>
                     {isShortage && <p className="text-xs text-red-500 mt-2">Warning: Insufficient finished goods in stock.</p>}
                </div>
            )}

            {/* LOT ALLOCATION TABLE */}
            {productId && cartonsNum > 0 && (
                <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                    <div className="flex justify-between items-end mb-2">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Lot Allocation</h3>
                         <div className="flex items-center space-x-3">
                             <button
                                type="button"
                                onClick={handleAutoFill}
                                className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50 transition-colors"
                             >
                                 Auto Fill (Oldest First)
                             </button>
                             <div className="text-xs">
                                 <span className="text-gray-500 dark:text-gray-400 mr-2">Required: <span className="font-bold">{cartonsNum}</span></span>
                                 <span className={totalAllocated !== cartonsNum ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                                     Allocated: {totalAllocated}
                                 </span>
                                 {unallocated > 0 && <span className="text-gray-400 ml-1">({unallocated} left)</span>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Lot Number</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Available</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">Allocate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                    {availableLots.length > 0 ? (
                                        availableLots.map((lot) => {
                                            const isAllocated = (allocations[lot.lot] || 0) > 0;
                                            return (
                                                <tr key={lot.lot} className={isAllocated ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                                                    <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-white whitespace-nowrap">
                                                        {lot.lot}
                                                    </td>
                                                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                        {new Date(lot.date).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-3 py-2 text-sm text-right font-mono text-gray-700 dark:text-gray-300">
                                                        {lot.remaining}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex justify-end">
                                                             <input
                                                                type="number"
                                                                min="0"
                                                                max={lot.remaining}
                                                                value={allocations[lot.lot] || ''}
                                                                onChange={(e) => handleAllocationChange(lot.lot, e.target.value)}
                                                                className="block w-20 text-right text-sm border-gray-300 rounded-md shadow-sm focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">
                                                No available lots found in stock.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {unallocated > 0 && availableLots.length === 0 && (
                         <p className="text-xs text-red-500 italic mt-1">No more lots available with stock. You may need to produce more.</p>
                    )}
                </div>
            )}

            <div className="md:col-span-2">
              <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">PO / Order Number (Optional)</label>
              <input 
                type="text" 
                id="orderNumber" 
                value={orderNumber} 
                onChange={e => setOrderNumber(e.target.value)} 
                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                placeholder="e.g., CUST-PO-9876"
              />
            </div>
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancel
          </button>
          <button type="submit" disabled={!productId || !cartons || cartonsNum <= 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
            Log Shipment
          </button>
        </div>
      </form>
    </div>
  );
};

export default LogShipmentForm;
