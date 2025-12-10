
import React, { useState, useMemo } from 'react';
import { ProductId, View, Customer, ProductState, Transaction, LotState } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogShipmentFormProps {
  logShipment: (productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string, lotAllocations?: Record<string, number>) => void;
  logBatchShipments: (items: Array<{productId: ProductId, cartons: number, allocations?: Record<string, number>}>, orderNumber: string, date?: string) => void;
  setView: (view: View) => void;
  inventory: ProductState; 
  transactions: Transaction[];
  lotState: LotState;
  settings: ReturnType<typeof useInventory>['settings'];
}

type ShipmentItem = {
    id: number;
    productId: ProductId;
    productName: string;
    cartons: number;
    allocations: Record<string, number>;
};

const LogShipmentForm: React.FC<LogShipmentFormProps> = ({ logBatchShipments, setView, inventory: productInventory, transactions, lotState }) => {
  // Global Shipment Details
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Staged Items
  const [shipmentItems, setShipmentItems] = useState<ShipmentItem[]>([]);

  // Item Entry State
  const [currentProductId, setCurrentProductId] = useState<ProductId | ''>('');
  const [currentCartons, setCurrentCartons] = useState<string>('');
  const [currentAllocations, setCurrentAllocations] = useState<Record<string, number>>({});

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

  // Available Lots for the CURRENT selected product
  const currentAvailableLots = useMemo(() => {
      if (!currentProductId) return [];
      
      const productionTxs = transactions.filter(
          t => t.type === 'PRODUCTION' && t.productId === currentProductId && t.orderNumber
      );

      const uniqueLots = new Map<string, string>();
      productionTxs.forEach(t => {
          const lot = t.orderNumber!;
          const current = uniqueLots.get(lot);
          if (!current || new Date(t.date) < new Date(current)) {
              uniqueLots.set(lot, t.date);
          }
      });

      const aggregated = Array.from(uniqueLots.entries()).map(([lot, date]) => {
          // Adjust remaining stock: subtract what's already staged in shipmentItems for this lot
          let stagedQty = 0;
          shipmentItems.forEach(item => {
              if (item.allocations[lot]) stagedQty += item.allocations[lot];
          });

          return {
              lot,
              date,
              remaining: (lotState[lot] || 0) - stagedQty
          };
      }).filter(l => l.remaining > 0);
      
      return aggregated.sort((a, b) => {
          const getSeq = (str: string) => {
              const match = str.match(/(\d+)$/);
              return match ? parseInt(match[0], 10) : 0;
          };
          const seqA = getSeq(a.lot);
          const seqB = getSeq(b.lot);
          
          if (seqA !== 0 && seqB !== 0 && seqA !== seqB) return seqA - seqB;
          if (a.lot !== b.lot) return a.lot.localeCompare(b.lot, undefined, { numeric: true });
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [currentProductId, transactions, lotState, shipmentItems]);

  const currentStock = currentProductId ? (productInventory[currentProductId] || 0) : 0;
  // Calculate effective remaining stock considering staged items
  const effectiveStock = useMemo(() => {
      if (!currentProductId) return 0;
      const staged = shipmentItems
        .filter(i => i.productId === currentProductId)
        .reduce((sum, i) => sum + i.cartons, 0);
      return Math.max(0, currentStock - staged);
  }, [currentProductId, currentStock, shipmentItems]);

  const currentCartonsNum = parseFloat(currentCartons) || 0;
  const isShortage = (effectiveStock - currentCartonsNum) < 0;
  
  const currentTotalAllocated = Object.values(currentAllocations).reduce<number>((sum, qty) => sum + (Number(qty) || 0), 0);
  const currentUnallocated = Math.max(0, currentCartonsNum - currentTotalAllocated);

  const handleAllocationChange = (lotNumber: string, val: string) => {
      const qty = parseFloat(val);
      if (isNaN(qty) || qty <= 0) {
          const newAlloc = { ...currentAllocations };
          delete newAlloc[lotNumber];
          setCurrentAllocations(newAlloc);
      } else {
          setCurrentAllocations(prev => ({ ...prev, [lotNumber]: qty }));
      }
  };

  const handleAutoFill = () => {
      if (currentCartonsNum <= 0) return;
      
      const newAllocations: Record<string, number> = {};
      let remainingToFill: number = currentCartonsNum;

      for (const lot of currentAvailableLots) {
          if (remainingToFill <= 0) break;
          const take = Math.min(remainingToFill, lot.remaining);
          if (take > 0) {
              newAllocations[lot.lot] = take;
              remainingToFill -= take;
          }
      }
      setCurrentAllocations(newAllocations);
  };

  const handleAddItem = () => {
      if (!currentProductId || currentCartonsNum <= 0) return;
      
      const product = FINISHED_PRODUCTS.find(p => p.id === currentProductId);
      
      setShipmentItems(prev => [...prev, {
          id: Date.now(),
          productId: currentProductId as ProductId,
          productName: product?.name || 'Unknown',
          cartons: currentCartonsNum,
          allocations: currentAllocations
      }]);

      // Reset item inputs
      setCurrentProductId('');
      setCurrentCartons('');
      setCurrentAllocations({});
  };

  const handleRemoveItem = (id: number) => {
      setShipmentItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (shipmentItems.length > 0 && date) {
        logBatchShipments(
            shipmentItems.map(item => ({
                productId: item.productId,
                cartons: item.cartons,
                allocations: Object.keys(item.allocations).length > 0 ? item.allocations : undefined
            })),
            orderNumber,
            date
        );
        setView('transactions');
    } else {
        alert('Please add at least one item to the shipment.');
    }
  };

  const handleCustomerChange = (newCustomer: Customer) => {
      if (shipmentItems.length > 0) {
          if(!window.confirm("Changing customer will clear current staged items. Continue?")) return;
          setShipmentItems([]);
      }
      setCustomer(newCustomer);
      setCurrentProductId('');
      setCurrentAllocations({});
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log Shipment</h2>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label htmlFor="customer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer</label>
                  <select id="customer" value={customer} onChange={e => handleCustomerChange(e.target.value as Customer)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="" disabled>Select a customer</option>
                    <option value="PHSA">PHSA</option>
                    <option value="PADM">PADM</option>
                    <option value="Alliance">Alliance</option>
                  </select>
              </div>
              <div>
                  <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">PO / Order Number</label>
                  <input type="text" id="orderNumber" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Required for grouping" />
              </div>
              <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipment Date</label>
                  <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
              </div>
          </div>
      </div>

      {/* STAGED ITEMS LIST */}
      {shipmentItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Items in this Shipment</h3>
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Lots</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Action</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {shipmentItems.map(item => (
                              <tr key={item.id}>
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{item.productName}</td>
                                  <td className="px-4 py-3 text-sm text-right font-mono font-bold text-gray-900 dark:text-white">{item.cartons}</td>
                                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-300">
                                      {Object.entries(item.allocations).length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                              {Object.entries(item.allocations).map(([lot, qty]) => (
                                                  <span key={lot} className="bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-500 font-mono">
                                                      {lot}: {qty}
                                                  </span>
                                              ))}
                                          </div>
                                      ) : <span className="text-red-500 italic">Unallocated</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                      <button onClick={() => handleRemoveItem(item.id)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm">Remove</button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* ADD ITEM SECTION */}
      <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Add Product to Shipment</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product</label>
                  <select value={currentProductId} onChange={e => { setCurrentProductId(e.target.value as ProductId); setCurrentAllocations({}); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={!customer}>
                    <option value="" disabled>Select a product</option>
                    {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
              </div>
              
              <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cartons</label>
                  <input type="number" value={currentCartons} onChange={e => setCurrentCartons(e.target.value)} min="1" className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>

              <div className="flex flex-col justify-end">
                   {currentProductId && (
                       <div className="text-sm">
                           <div className="flex justify-between mb-1">
                               <span className="text-gray-600 dark:text-gray-400">Available Stock:</span>
                               <span className={`font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>{effectiveStock} cartons</span>
                           </div>
                           {isShortage && <span className="text-xs text-red-500">Warning: Not enough stock.</span>}
                       </div>
                   )}
              </div>
          </div>

          {/* LOT ALLOCATION */}
          {currentProductId && currentCartonsNum > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                    <div className="flex justify-between items-end mb-2">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Lot Allocation</h4>
                         <div className="flex items-center space-x-3">
                             <button type="button" onClick={handleAutoFill} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50 transition-colors">
                                 Auto Fill
                             </button>
                             <div className="text-xs">
                                 <span className="text-gray-500 dark:text-gray-400 mr-2">Allocated:</span>
                                 <span className={currentTotalAllocated !== currentCartonsNum ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                                     {currentTotalAllocated} / {currentCartonsNum}
                                 </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md overflow-hidden">
                        <div className="overflow-x-auto max-h-48">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                                <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Lot Number</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Avail</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase w-24">Alloc</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                                    {currentAvailableLots.length > 0 ? (
                                        currentAvailableLots.map((lot) => {
                                            const isAllocated = (currentAllocations[lot.lot] || 0) > 0;
                                            return (
                                                <tr key={lot.lot} className={isAllocated ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                                                    <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-white whitespace-nowrap">{lot.lot}</td>
                                                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(lot.date).toLocaleDateString()}</td>
                                                    <td className="px-3 py-2 text-sm text-right font-mono text-gray-700 dark:text-gray-300">{lot.remaining}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex justify-end">
                                                             <input type="number" min="0" max={lot.remaining} value={currentAllocations[lot.lot] || ''} onChange={(e) => handleAllocationChange(lot.lot, e.target.value)} className="block w-20 text-right text-sm border-gray-300 rounded-md shadow-sm focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">No available lots found in stock.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-4 flex justify-end">
                <button type="button" onClick={handleAddItem} disabled={!currentProductId || currentCartonsNum <= 0} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                    Add to Shipment
                </button>
            </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancel
          </button>
          <button type="submit" onClick={handleSubmit} disabled={shipmentItems.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
            Complete Shipment
          </button>
      </div>
    </div>
  );
};

export default LogShipmentForm;
