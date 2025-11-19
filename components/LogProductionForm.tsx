
import React, { useState, useMemo } from 'react';
import { ProductId, View, Customer, InventoryState, InventoryItemId } from '../types';
import { FINISHED_PRODUCTS, METERS_PER_ROLL, INVENTORY_ITEMS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogProductionFormProps {
  logProduction: (productId: ProductId, cartonsProduced: number, orderNumber: string, date?: string) => void;
  setView: (view: View) => void;
  inventory: InventoryState;
  settings: ReturnType<typeof useInventory>['settings'];
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const LogProductionForm: React.FC<LogProductionFormProps> = ({ logProduction, setView, inventory, settings }) => {
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [productId, setProductId] = useState<ProductId | ''>('');
  const [cartons, setCartons] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

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
        if (itemId === 'nosewire') {
            requiredQty = (totalMasks / settings.materialUsage.masksPerRollNosewire) * rejection;
        } else if (itemId === 'elastic') {
            requiredQty = (totalMasks / settings.materialUsage.masksPerRollElastic) * rejection;
        } else if (ITEMS_MAP.get(itemId)?.unit === 'rolls') {
            requiredQty = (totalMasks * settings.materialUsage.fabricPerMask / METERS_PER_ROLL) * rejection;
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
    if (productId && cartons && parseFloat(cartons) > 0 && date) {
      logProduction(productId, parseFloat(cartons), orderNumber, date);
      setView('transactions');
    } else {
      alert('Please fill all required fields.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log Production</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">Record finished goods produced. This will deduct raw materials from inventory and add to finished goods stock.</p>
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
            <div className="md:col-span-2">
              <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Batch / PO Number (Optional)</label>
              <input 
                type="text" 
                id="orderNumber" 
                value={orderNumber} 
                onChange={e => setOrderNumber(e.target.value)} 
                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                placeholder="e.g., BATCH-001"
              />
            </div>
        </div>

        {deductionPreview && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
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
          <button type="submit" disabled={!productId || !cartons || parseFloat(cartons) <= 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
            Log Production
          </button>
        </div>
      </form>
    </div>
  );
};

export default LogProductionForm;
