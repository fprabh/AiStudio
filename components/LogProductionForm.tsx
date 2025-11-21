
import React, { useState, useMemo, useEffect } from 'react';
import { ProductId, View, Customer, InventoryState, InventoryItemId, AppSettings, LotLevel } from '../types';
import { FINISHED_PRODUCTS, INVENTORY_ITEMS, getProductLotConfig } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogProductionFormProps {
  logProduction: (productId: ProductId, cartonsProduced: number, orderNumber: string, date?: string, materialLinkage?: Partial<Record<InventoryItemId, string>>) => void;
  setView: (view: View) => void;
  inventory: InventoryState;
  settings: ReturnType<typeof useInventory>['settings'];
  updateSettings: ReturnType<typeof useInventory>['updateSettings'];
}

interface LotAllocation {
    lotNumber: string;
    quantity: number;
    isNew: boolean;
    currentStock: number; // What is already there before this tx
    maxCapacity: number;
    level: LotLevel;
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const getMasksPerRoll = (itemId: InventoryItemId, settings: AppSettings): number => {
    if (itemId === 'meltblownFabric') return settings.materialUsage.masksPerRollMeltblown;
    if (itemId === 'backLayerFabric') return settings.materialUsage.masksPerRollBackLayer;
    if (itemId.startsWith('outerLayerL1')) return settings.materialUsage.masksPerRollOuterL1;
    if (itemId.startsWith('outerLayerL2')) return settings.materialUsage.masksPerRollOuterL2;
    if (itemId.startsWith('outerLayerL3')) return settings.materialUsage.masksPerRollOuterL3;
    if (itemId === 'nosewire') return settings.materialUsage.masksPerRollNosewire;
    if (itemId === 'elastic') return settings.materialUsage.masksPerRollElastic;
    return 1; 
};

const LogProductionForm: React.FC<LogProductionFormProps> = ({ logProduction, setView, inventory, settings, updateSettings }) => {
  const { transactions } = useInventory(); 
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [productId, setProductId] = useState<ProductId | ''>('');
  const [cartons, setCartons] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Traceability State
  // selectionMap: Stores dropdown value (e.g. "PO-123", "Count", "")
  const [materialSelection, setMaterialSelection] = useState<Partial<Record<InventoryItemId, string>>>({});
  // customInputMap: Stores manual text input when selection is "Count"
  const [customInputs, setCustomInputs] = useState<Partial<Record<InventoryItemId, string>>>({});

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

  // Determine required raw materials for traceability
  const requiredTraceabilityItems = useMemo(() => {
      if (!productId) return [];
      const formula = settings.productFormulas[productId];
      if (!formula) return [];

      // We only track Raw Materials, excluding packaging
      const items: InventoryItemId[] = [];
      Object.values(formula.rawMaterials).forEach(id => {
           const item = ITEMS_MAP.get(id as InventoryItemId);
           if (item && !settings.bypassedItems[item.id]) {
               items.push(item.id);
           }
      });
      return items;
  }, [productId, settings]);

  // Fetch Available Stock IDs for dropdowns
  const availableStockIds = useMemo(() => {
      const map: Partial<Record<InventoryItemId, string[]>> = {};
      
      requiredTraceabilityItems.forEach(itemId => {
          const ids = new Set<string>();
          transactions.forEach(t => {
              if (t.type === 'IN' && t.details.length > 0 && t.details[0].itemId === itemId && t.orderNumber) {
                  ids.add(t.orderNumber);
              }
          });
          map[itemId] = Array.from(ids).sort();
      });
      return map;
  }, [requiredTraceabilityItems, transactions]);

  // Initialize state when product changes
  useEffect(() => {
      setMaterialSelection({});
      setCustomInputs({});
  }, [productId]);

  // Automatic Lot Allocation Logic
  const lotAllocations = useMemo<LotAllocation[]>(() => {
    const cartonsNum = parseFloat(cartons);
    if (!productId || !cartonsNum || cartonsNum <= 0 || !customer) return [];

    const config = getProductLotConfig(productId as ProductId, settings);
    const currentLevel = config.level;
    const maxCapacity = config.maxCartons;

    // 1. Analyze Transaction History
    const lotsMap: Record<string, { totalProduced: number, ownerCustomer: Customer, lastDate: Date }> = {};
    
    transactions.forEach(tx => {
            if ((tx.type === 'PRODUCTION' || tx.type === 'OUT') && tx.orderNumber && tx.productId) {
                const txProd = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                if (!txProd) return;

                if (!lotsMap[tx.orderNumber]) {
                    lotsMap[tx.orderNumber] = { 
                        totalProduced: 0, 
                        ownerCustomer: txProd.customer,
                        lastDate: new Date(tx.date)
                    };
                }
                lotsMap[tx.orderNumber].totalProduced += (tx.cartonsShipped || 0);
                if (new Date(tx.date) > lotsMap[tx.orderNumber].lastDate) {
                    lotsMap[tx.orderNumber].lastDate = new Date(tx.date);
                }
            }
    });

    // 2. Find the most recent active lot for THIS customer at THIS level
    let activeLot = '';
    let activeLotProduced = 0;
    let latestDate = new Date(0);

    Object.entries(lotsMap).forEach(([lotNum, data]) => {
        if (lotNum.startsWith(currentLevel) && data.ownerCustomer === customer) {
            if (data.lastDate > latestDate) {
                latestDate = data.lastDate;
                activeLot = lotNum;
                activeLotProduced = data.totalProduced;
            }
        }
    });

    // 3. Determine Max Sequence for New Lots
    let maxSeq = settings.lotSequences[currentLevel];
    Object.keys(lotsMap).forEach(lotNum => {
        if (lotNum.startsWith(currentLevel)) {
            const parts = lotNum.split('-');
            if (parts.length === 2) {
                const seq = parseInt(parts[1].trim(), 10);
                if (!isNaN(seq) && seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }
    });

    const allocations: LotAllocation[] = [];
    let remainingToAllocate = cartonsNum;
    let currentSeq = maxSeq;

    // 4a. Fill Active Lot First (if exists and has space)
    if (activeLot && activeLotProduced < maxCapacity) {
        const availableSpace = maxCapacity - activeLotProduced;
        const take = Math.min(remainingToAllocate, availableSpace);
        
        allocations.push({
            lotNumber: activeLot,
            quantity: take,
            isNew: false,
            currentStock: activeLotProduced,
            maxCapacity: maxCapacity,
            level: currentLevel
        });
        remainingToAllocate -= take;
    }

    // 4b. Generate New Lots for Remainder
    while (remainingToAllocate > 0) {
        currentSeq++;
        const newLotNumber = `${currentLevel} - ${currentSeq}`;
        const take = Math.min(remainingToAllocate, maxCapacity);

        allocations.push({
            lotNumber: newLotNumber,
            quantity: take,
            isNew: true,
            currentStock: 0,
            maxCapacity: maxCapacity,
            level: currentLevel
        });
        remainingToAllocate -= take;
    }

    return allocations;
  }, [productId, cartons, customer, settings, transactions]);


  const deductionPreview = useMemo(() => {
    if (!productId || !cartons || parseFloat(cartons) <= 0) return null;

    const rule = settings.productFormulas[productId];
    if (!rule) return null;

    const cartonsProduced = parseFloat(cartons);
    const totalMasks = cartonsProduced * rule.boxesPerCarton * rule.masksPerBox;
    
    const deductions: Partial<Record<InventoryItemId, number>> = {};

    // Raw Materials
    Object.values(rule.rawMaterials).forEach(unknownItemId => {
        const itemId = unknownItemId as InventoryItemId;
        const rejection = 1 + (settings.rejectionCoefficients[itemId] || 0) / 100;
        let requiredQty = 0;
        
        const itemInfo = ITEMS_MAP.get(itemId);
        if (itemInfo?.unit === 'rolls') {
             const masksPerRoll = getMasksPerRoll(itemId, settings);
             requiredQty = (totalMasks / masksPerRoll) * rejection;
        }
        deductions[itemId] = requiredQty;
    });
    
    // Packaging Materials
    deductions[rule.packaging.box] = cartonsProduced * rule.boxesPerCarton;
    deductions[rule.packaging.carton] = cartonsProduced;
    
    return deductions;

  }, [productId, cartons, settings]);
  
  const insufficientStockItems = useMemo(() => {
    if (!deductionPreview) return [];
    return Object.entries(deductionPreview)
      .filter(([itemId, quantity]) => 
          !settings.bypassedItems[itemId as InventoryItemId] && 
          (inventory[itemId as InventoryItemId] || 0) < (quantity as number)
      )
      .map(([itemId]) => ITEMS_MAP.get(itemId as InventoryItemId)?.name);
  }, [deductionPreview, inventory, settings]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productId && cartons && parseFloat(cartons) > 0 && date && lotAllocations.length > 0) {
      
      // Construct final material linkage
      const finalLinkage: Partial<Record<InventoryItemId, string>> = {};
      requiredTraceabilityItems.forEach(itemId => {
          const selection = materialSelection[itemId];
          if (selection) {
              if (selection.toLowerCase() === 'count') {
                  finalLinkage[itemId] = customInputs[itemId] || 'Count (No ID)';
              } else {
                  finalLinkage[itemId] = selection;
              }
          }
      });

      // Log each allocation as a separate transaction
      lotAllocations.forEach(alloc => {
          logProduction(productId, alloc.quantity, alloc.lotNumber, date, Object.keys(finalLinkage).length > 0 ? finalLinkage : undefined);
      });

      // Update Lot Sequence Settings if we generated new lots with higher sequences
      const lastAllocation = lotAllocations[lotAllocations.length - 1];
      if (lastAllocation) {
           const currentSeq = parseInt(lastAllocation.lotNumber.split('-')[1]?.trim() || '0');
           if (currentSeq > settings.lotSequences[lastAllocation.level]) {
               updateSettings({
                  lotSequences: {
                      ...settings.lotSequences,
                      [lastAllocation.level]: currentSeq
                  }
               });
           }
      }

      setView('transactions');
    } else {
      alert('Please fill all required fields.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log Production</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">Record finished goods produced. The system will automatically assign Lot Numbers based on capacity and customer availability.</p>
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="customer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer</label>
              <select id="customer" value={customer} onChange={e => { setCustomer(e.target.value as Customer); setProductId(''); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="" disabled>Select a customer</option>
                <option value="PHSA">PHSA</option>
                <option value="PADM">PADM</option>
                <option value="Alliance">Alliance</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="product" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Produced</label>
              <select id="product" value={productId} onChange={e => setProductId(e.target.value as ProductId)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={!customer}>
                <option value="" disabled>Select a product</option>
                {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cartons" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cartons Produced</label>
              <input type="number" id="cartons" value={cartons} onChange={e => setCartons(e.target.value)} min="1" className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Production Date</label>
              <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
        </div>

        {/* Raw Material Traceability */}
        {requiredTraceabilityItems.length > 0 && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-md font-medium text-gray-900 dark:text-white mb-3">Raw Material Traceability</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requiredTraceabilityItems.map(itemId => {
                         const item = ITEMS_MAP.get(itemId);
                         const stockIds = availableStockIds[itemId] || [];
                         const selectedValue = materialSelection[itemId] || '';
                         const isCountSelected = selectedValue.toLowerCase() === 'count';

                         return (
                             <div key={itemId} className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-md border border-gray-200 dark:border-gray-600">
                                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 truncate">
                                     {item?.name || itemId}
                                 </label>
                                 <select
                                     value={selectedValue}
                                     onChange={e => setMaterialSelection(prev => ({ ...prev, [itemId]: e.target.value }))}
                                     className="block w-full text-xs py-1.5 pl-2 pr-8 border-gray-300 rounded focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-500 dark:text-white mb-2"
                                 >
                                     <option value="">-- Select Batch/Roll --</option>
                                     {stockIds.map(id => (
                                         <option key={id} value={id}>{id}</option>
                                     ))}
                                     <option value="Count">Count (Manual Adjustment)</option>
                                 </select>
                                 
                                 {isCountSelected && (
                                     <input
                                        type="text"
                                        placeholder="Enter Manual Stock ID"
                                        value={customInputs[itemId] || ''}
                                        onChange={e => setCustomInputs(prev => ({ ...prev, [itemId]: e.target.value }))}
                                        className="block w-full text-xs py-1.5 px-2 border-gray-300 rounded focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-500 dark:text-white"
                                     />
                                 )}
                             </div>
                         );
                    })}
                </div>
            </div>
        )}

        {/* Lot Allocation Preview */}
        {lotAllocations.length > 0 && (
            <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Lot Allocation Preview</h3>
              <div className="space-y-3">
                  {lotAllocations.map((alloc, idx) => (
                      <div key={alloc.lotNumber} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                          <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-gray-900 dark:text-white">{alloc.lotNumber}</span>
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${alloc.isNew ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                                      {alloc.isNew ? 'New' : 'Continuing'}
                                  </span>
                              </div>
                              <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                  Adding <span className="text-green-600 dark:text-green-400 font-bold">+{alloc.quantity}</span> cartons
                              </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                              {/* Existing Stock */}
                              <div 
                                className="absolute top-0 left-0 h-full bg-gray-500 dark:bg-gray-400" 
                                style={{ width: `${(alloc.currentStock / alloc.maxCapacity) * 100}%` }}
                              ></div>
                              {/* New Addition */}
                              <div 
                                className="absolute top-0 h-full bg-green-500 dark:bg-green-500" 
                                style={{ 
                                    left: `${(alloc.currentStock / alloc.maxCapacity) * 100}%`,
                                    width: `${(alloc.quantity / alloc.maxCapacity) * 100}%` 
                                }}
                              ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                              <span>Previous: {alloc.currentStock}</span>
                              <span>Max: {alloc.maxCapacity}</span>
                          </div>
                      </div>
                  ))}
              </div>
              {lotAllocations.length > 1 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 italic">
                      Note: Production quantity exceeds capacity of a single lot. Split into {lotAllocations.length} lots.
                  </p>
              )}
            </div>
        )}

        {deductionPreview && (
          <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Material Breakdown & Stock Check</h3>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Required</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">In Stock</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remaining</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {Object.entries(deductionPreview).map(([itemId, qty]) => {
                            const item = ITEMS_MAP.get(itemId as InventoryItemId);
                            const isBypassed = settings.bypassedItems[itemId as InventoryItemId];
                            if(isBypassed || !item) return null;
                            
                            const requiredQty = qty as number;
                            const currentStock = inventory[itemId as keyof InventoryState] || 0;
                            const remainingStock = currentStock - requiredQty;
                            const isShortage = remainingStock < 0;
                            
                            const formatVal = (val: number) => item.unit === 'rolls' ? val.toFixed(2) : val.toLocaleString(undefined, { maximumFractionDigits: 1 });

                            return (
                                <tr key={itemId} className={isShortage ? 'bg-red-50 dark:bg-red-900/20' : ''}>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                        {item.name}
                                        <span className="block text-xs text-gray-500 font-normal">{item.unit}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-300 font-mono">
                                        {formatVal(requiredQty)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-300 font-mono">
                                        {formatVal(currentStock)}
                                    </td>
                                    <td className={`px-4 py-3 text-sm text-right font-mono font-bold ${isShortage ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                        {formatVal(remainingStock)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {insufficientStockItems.length > 0 && (
             <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4 border border-red-200 dark:border-red-800 mt-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Insufficient Raw Material</h3>
                        <div className="mt-2 text-sm text-red-700 dark:text-red-400">
                            <p>The following items will drop below zero:</p>
                            <ul className="list-disc pl-5 space-y-1 mt-1">
                                {insufficientStockItems.map(name => <li key={name}>{name}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancel
          </button>
          <button type="submit" disabled={!productId || !cartons || parseFloat(cartons) <= 0 || lotAllocations.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
            Log Production
          </button>
        </div>
      </form>
    </div>
  );
};

export default LogProductionForm;
