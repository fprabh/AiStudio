
import React, { useState, useMemo } from 'react';
import { Transaction, InventoryItemId, ProductId, InventoryState } from '../types';
import { useInventory } from '../hooks/useInventory';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS } from '../constants';
import { calculateDeductions } from '../utils';

type EditModalProps = {
    transaction: Transaction;
    onClose: () => void;
    onSave: (transaction: Transaction) => void;
    settings: ReturnType<typeof useInventory>['settings'];
    inventory?: InventoryState; // Optional because Shipments might not pass it, but Production will
};

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const EditTransactionModal: React.FC<EditModalProps> = ({ transaction, onClose, onSave, settings, inventory }) => {
    const [formData, setFormData] = useState({
        date: new Date(transaction.date).toISOString().split('T')[0],
        orderNumber: transaction.orderNumber || '',
        // Stock In specific
        itemId: transaction.type === 'IN' && transaction.details.length > 0 ? transaction.details[0].itemId : '',
        quantity: transaction.type === 'IN' && transaction.details.length > 0 ? transaction.details[0].quantity : 0,
        notes: transaction.type === 'IN' ? transaction.description.match(/\((.*)\)/)?.[1] || '' : '',
        // Production / Shipment specific
        productId: transaction.productId || '',
        cartonsShipped: transaction.cartonsShipped || 0,
    });
    
    const updatedDetails = useMemo(() => {
        if ((transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && formData.productId && formData.cartonsShipped > 0) {
            // Calculates raw material usage for Preview only
            return calculateDeductions(formData.productId as ProductId, formData.cartonsShipped, settings);
        } else if (transaction.type === 'IN' && formData.itemId && formData.quantity > 0) {
            const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
            if (!item) return [];
            return [{ itemId: item.id, itemName: item.name, quantity: formData.quantity }];
        }
        return transaction.details || []; 
    }, [formData, settings, transaction.type, transaction.details]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const isNumber = e.target.type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
        const product = FINISHED_PRODUCTS.find(p => p.id === formData.productId);
        
        let description = '';
        if (transaction.type === 'IN' && item) {
             description = `Stock Received: ${item.name} ${formData.notes ? `(${formData.notes})` : ''}`
        } else if (transaction.type === 'PRODUCTION' && product) {
            description = `Production: ${formData.cartonsShipped} carton(s) of ${product.name}`
        } else if (transaction.type === 'SHIPMENT' && product) {
            description = `Shipment: ${formData.cartonsShipped} carton(s) of ${product.name} to ${product.customer}`
        }

        const updatedTransaction: Transaction = {
            ...transaction,
            date: new Date(formData.date).toISOString(),
            orderNumber: formData.orderNumber || undefined,
            // Only IN transactions store details persistently. 
            // PRODUCTION and SHIPMENT details are calculated dynamically based on product/cartons and settings.
            details: transaction.type === 'IN' ? updatedDetails : [], 
            description,
            productId: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') && formData.productId ? formData.productId as ProductId : undefined,
            cartonsShipped: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') ? formData.cartonsShipped : undefined,
        };

        onSave(updatedTransaction);
    };

    const renderStockInForm = () => (
        <>
            <div>
                <label className="block text-sm font-medium">Item</label>
                <select name="itemId" value={formData.itemId} onChange={handleChange} className="mt-1 block w-full input-base" required>
                    {INVENTORY_ITEMS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">Quantity</label>
                <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className="mt-1 block w-full input-base" step="any" min="0.0001" required />
            </div>
             <div>
                <label className="block text-sm font-medium">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} className="mt-1 block w-full input-base" rows={2}/>
            </div>
        </>
    );

    const renderProductForm = (label: string) => (
         <>
            <div>
                <label className="block text-sm font-medium">Product</label>
                <select name="productId" value={formData.productId} onChange={handleChange} className="mt-1 block w-full input-base" required>
                    {FINISHED_PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{label}</label>
                <input type="number" name="cartonsShipped" value={formData.cartonsShipped} onChange={handleChange} className="mt-1 block w-full input-base" min="1" required/>
            </div>
        </>
    );

    const renderDetailedProductionTable = () => {
        if (!inventory) return null;

        // Create a map of original deductions to "add back" to simulated stock
        const originalDeductionsMap = new Map<InventoryItemId, number>();
        if (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') {
             // If transaction has details (it should if it's old), use them. 
             // If it's a dynamic calculation type, we might need to recalculate original based on original props if details are empty,
             // but `transactions` state from hook usually hydrates details for display or we can rely on what was passed.
             // Note: useInventory hook reconstructs details for PRODUCTION when loading, or they might be empty if we rely on dynamic calc.
             // Let's calculate original deductions based on the original transaction data to be safe
             if (transaction.productId && transaction.cartonsShipped) {
                  const originalCalc = calculateDeductions(transaction.productId, transaction.cartonsShipped, settings);
                  originalCalc.forEach(d => originalDeductionsMap.set(d.itemId, Math.abs(d.quantity)));
             } else {
                  transaction.details.forEach(d => originalDeductionsMap.set(d.itemId, Math.abs(d.quantity)));
             }
        }

        return (
            <div className="pt-2">
                <h4 className="text-sm font-semibold mb-2">Material Breakdown & Stock Check:</h4>
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                     <div className="overflow-x-auto max-h-60">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                             <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Req</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {updatedDetails.map(d => {
                                    const requiredQty = Math.abs(d.quantity);
                                    const originalQty = originalDeductionsMap.get(d.itemId) || 0;
                                    const currentStock = inventory[d.itemId] || 0;
                                    
                                    // Effective Stock = Current + Original (Simulating reversion of original tx)
                                    const effectiveStock = currentStock + originalQty;
                                    const remaining = effectiveStock - requiredQty;
                                    const isShortage = remaining < 0;
                                    const item = ITEMS_MAP.get(d.itemId);
                                    const formatVal = (val: number) => item?.unit === 'rolls' ? val.toFixed(2) : val.toLocaleString(undefined, { maximumFractionDigits: 0 });

                                    return (
                                        <tr key={d.itemId} className={`text-xs ${isShortage ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}`}>
                                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white truncate max-w-[120px]" title={d.itemName}>{d.itemName}</td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{formatVal(requiredQty)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300" title={`Current: ${formatVal(currentStock)} + Original: ${formatVal(originalQty)}`}>
                                                {formatVal(effectiveStock)}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-mono font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>
                                                {formatVal(remaining)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-1 italic">
                    * Stock column adds back the original deduction to simulate available inventory.
                </p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-full overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h3 className="text-xl font-bold">Edit Transaction</h3>

                    {transaction.type === 'IN' && renderStockInForm()}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && renderProductForm("Cartons Produced")}
                    {transaction.type === 'SHIPMENT' && renderProductForm("Cartons Shipped")}
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium">Date</label>
                            <input type="date" name="date" value={formData.date} onChange={handleChange} className="mt-1 block w-full input-base" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Reference Number</label>
                            <input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleChange} className="mt-1 block w-full input-base" />
                        </div>
                    </div>

                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && inventory ? (
                        renderDetailedProductionTable()
                    ) : (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') ? (
                         // Fallback if no inventory prop passed (unlikely in this app flow but good for safety)
                         <div className="pt-2">
                            <h4 className="text-sm font-semibold mb-1">Material Deductions (Preview):</h4>
                            <ul className="text-xs space-y-1 max-h-24 overflow-y-auto p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                {updatedDetails.map(d => (
                                    <li key={d.itemId} className="flex justify-between">
                                        <span>{d.itemName}</span>
                                        <span className={`font-mono ${d.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {d.quantity > 0 ? '+' : ''}{d.quantity % 1 !== 0 ? d.quantity.toFixed(4) : d.quantity.toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
             <style>{`
                .input-base {
                    display: block;
                    width: 100%;
                    padding-left: 0.75rem;
                    padding-right: 0.75rem;
                    padding-top: 0.5rem;
                    padding-bottom: 0.5rem;
                    font-size: 0.875rem;
                    line-height: 1.25rem;
                    border-width: 1px;
                    border-color: #D1D5DB;
                    border-radius: 0.375rem;
                }
                .dark .input-base {
                    background-color: #374151;
                    border-color: #4B5563;
                    color: #FFFFFF;
                }
                .input-base:focus {
                     outline: 2px solid transparent;
                     outline-offset: 2px;
                     --tw-ring-color: #B11E31;
                     border-color: #B11E31;
                }
            `}</style>
        </div>
    );
};

export default EditTransactionModal;
