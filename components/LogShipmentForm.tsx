
import React, { useState, useMemo } from 'react';
import { ProductId, View, Customer, ProductState } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogShipmentFormProps {
  logShipment: (productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string) => void;
  setView: (view: View) => void;
  inventory: ProductState; // Passed as generic 'inventory' prop, but maps to productInventory in App.tsx
  settings: ReturnType<typeof useInventory>['settings'];
}

const LogShipmentForm: React.FC<LogShipmentFormProps> = ({ logShipment, setView, inventory: productInventory }) => {
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [productId, setProductId] = useState<ProductId | ''>('');
  const [cartons, setCartons] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

  const currentStock = productId ? (productInventory[productId] || 0) : 0;
  const cartonsNum = parseFloat(cartons) || 0;
  const remainingStock = currentStock - cartonsNum;
  const isShortage = remainingStock < 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productId && cartons && cartonsNum > 0 && date) {
      logShipment(productId, cartonsNum, orderNumber, date);
      setView('transactions');
    } else {
      alert('Please fill all required fields.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log Shipment</h2>
      <p className="mb-4 text-gray-600 dark:text-gray-400">Record a shipment leaving the warehouse. This deducts from finished goods inventory.</p>
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
              <label htmlFor="product" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Shipped</label>
              <select id="product" value={productId} onChange={e => setProductId(e.target.value as ProductId)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" disabled={!customer}>
                <option value="" disabled>Select a product</option>
                {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            <div>
                <label htmlFor="cartons" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cartons Shipped</label>
                <input type="number" id="cartons" value={cartons} onChange={e => setCartons(e.target.value)} min="1" className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>

             <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipment Date</label>
              <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            
             {productId && (
                <div className="md:col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Current Stock:</span>
                        <span className="font-mono font-medium text-gray-900 dark:text-white">{currentStock} cartons</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Remaining after Shipment:</span>
                        <span className={`font-mono font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>{remainingStock} cartons</span>
                    </div>
                     {isShortage && <p className="text-xs text-red-500 mt-2">Warning: Insufficient finished goods in stock.</p>}
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
