import React, { useState, useMemo } from 'react';
import { ProductId, View, Customer, InventoryState, InventoryItemId } from '../types';
import { FINISHED_PRODUCTS, METERS_PER_ROLL, INVENTORY_ITEMS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LogShipmentFormProps {
  logShipment: (productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string) => void;
  setView: (view: View) => void;
  inventory: InventoryState;
  settings: ReturnType<typeof useInventory>['settings'];
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const LogShipmentForm: React.FC<LogShipmentFormProps> = ({ logShipment, setView, inventory, settings }) => {
  const [customer, setCustomer] = useState<Customer | ''>('');
  const [productId, setProductId] = useState<ProductId | ''>('');
  const [cartons, setCartons] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showPreview, setShowPreview] = useState(false);

  const availableProducts = useMemo(() => {
    return customer ? FINISHED_PRODUCTS.filter(p => p.customer === customer) : [];
  }, [customer]);

  const deductionPreview = useMemo(() => {
    if (!productId || !cartons || parseFloat(cartons) <= 0) return null;

    const rule = settings.productFormulas[productId];
    const cartonsShipped = parseFloat(cartons);
    const totalMasks = cartonsShipped * rule.boxesPerCarton * rule.masksPerBox;
    
    const deductions: Partial<Record<InventoryItemId, number>> = {};

    // Raw Materials
    // FIX: Cast item from Object.values to InventoryItemId to fix typing errors.
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
    deductions[rule.packaging.box] = cartonsShipped * rule.boxesPerCarton;
    deductions[rule.packaging.carton] = cartonsShipped;
    
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
      logShipment(productId, parseFloat(cartons), orderNumber, date);
      setView('transactions');
    } else {
      alert('Please fill all required fields.');
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Log a Shipment</h2>
      <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div>
          <label htmlFor="customer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer</label>
          <select id="customer" value={customer} onChange={e => { setCustomer(e.target.value as Customer); setProductId(''); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600">
            <option value="" disabled>Select a customer</option>
            <option value="PHSA">PHSA</option>
            <option value="PADM">PADM</option>
            <option value="Alliance">Alliance</option>
          </select>
        </div>
        <div>
          <label htmlFor="product" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Shipped</label>
          <select id="product" value={productId} onChange={e => setProductId(e.target.value as ProductId)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600" disabled={!customer}>
            <option value="" disabled>Select a product</option>
            {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cartons" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cartons Shipped</label>
              <input type="number" id="cartons" value={cartons} onChange={e => setCartons(e.target.value)} min="1" className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600" />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shipment Date</label>
              <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600" required />
            </div>
        </div>
        <div>
          <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">PO / Order Number (Optional)</label>
          <input 
            type="text" 
            id="orderNumber" 
            value={orderNumber} 
            onChange={e => setOrderNumber(e.target.value)} 
            className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600" 
            placeholder="e.g., CUST-PO-9876"
          />
        </div>
        {deductionPreview && (
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600">
            <button type="button" onClick={() => setShowPreview(!showPreview)} className="text-sm font-medium text-brand-dark dark:text-gray-300 w-full text-left">
              {showPreview ? 'Hide' : 'Show'} Deduction Preview
            </button>
            {showPreview && (
                <ul className="mt-2 space-y-1 text-xs">
                    {Object.entries(deductionPreview).map(([itemId, qty]) => {
                        const isBypassed = settings.bypassedItems[itemId as InventoryItemId];
                        if(isBypassed) return null;
                        
                        const qtyAsNumber = qty as number;
                        const currentStock = inventory[itemId as keyof InventoryState] || 0;
                        const hasEnough = currentStock >= qtyAsNumber;
                        return (
                            <li key={itemId} className={`flex justify-between p-1 rounded ${!hasEnough ? 'bg-yellow-100 dark:bg-yellow-900/50' : ''}`}>
                                <span>{ITEMS_MAP.get(itemId as InventoryItemId)?.name || itemId}</span>
                                <span className='font-mono'>
                                    {qtyAsNumber % 1 !== 0 ? qtyAsNumber.toFixed(4) : qtyAsNumber.toLocaleString()}
                                </span>
                            </li>
                        )
                    }).filter(Boolean)}
                </ul>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancel
          </button>
          <button type="submit" disabled={!productId || !cartons || parseFloat(cartons) <= 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
            Log Shipment
          </button>
        </div>
        {insufficientStockItems.length > 0 && <p className="text-xs text-yellow-600 dark:text-yellow-400 text-right">Warning: Insufficient stock for {insufficientStockItems.join(', ')}. Inventory will become negative.</p>}
      </form>
    </div>
  );
};

export default LogShipmentForm;