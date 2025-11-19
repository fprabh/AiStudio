
import React, { useState, useMemo } from 'react';
import { Transaction, InventoryItemId, ProductId, InventoryState, ProductState } from '../types';
import { useInventory } from '../hooks/useInventory';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS } from '../constants';
import { calculateDeductions } from '../utils';

type EditModalProps = {
    transaction: Transaction;
    onClose: () => void;
    onSave: (transaction: Transaction, splitTransaction?: Transaction) => void;
    settings: ReturnType<typeof useInventory>['settings'];
    inventory?: InventoryState; 
    productInventory?: ProductState;
};

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const EditTransactionModal: React.FC<EditModalProps> = ({ transaction, onClose, onSave, settings, inventory, productInventory }) => {
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

    // Split functionality state
    const [isSplitMode, setIsSplitMode] = useState(false);
    const [splitData, setSplitData] = useState({
        quantity: '',
        date: new Date(transaction.date).toISOString().split('T')[0],
        orderNumber: '',
    });

    const canSplit = (transaction.type === 'PRODUCTION' || transaction.type === 'OUT');

    const updatedDetails = useMemo(() => {
        let effectiveCartons = formData.cartonsShipped;
        if (isSplitMode && canSplit) {
             const splitQty = parseFloat(splitData.quantity) || 0;
             effectiveCartons = Math.max(0, formData.cartonsShipped - splitQty);
        }

        if ((transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && formData.productId && effectiveCartons > 0) {
            // Calculates raw material usage for Preview only
            return calculateDeductions(formData.productId as ProductId, effectiveCartons, settings);
        } else if (transaction.type === 'IN' && formData.itemId && formData.quantity > 0) {
            const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
            if (!item) return [];
            return [{ itemId: item.id, itemName: item.name, quantity: formData.quantity }];
        }
        return transaction.details || []; 
    }, [formData, settings, transaction.type, transaction.details, isSplitMode, splitData.quantity, canSplit]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const isNumber = e.target.type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
    };

    const handleSplitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSplitData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Base Updates
        const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
        const product = FINISHED_PRODUCTS.find(p => p.id === formData.productId);
        
        const getDescription = (type: string, qty: number, prod?: typeof product, it?: typeof item) => {
            if (type === 'IN' && it) return `Stock Received: ${it.name} ${formData.notes ? `(${formData.notes})` : ''}`;
            if (type === 'PRODUCTION' && prod) return `Production: ${qty} carton(s) of ${prod.name}`;
            if (type === 'SHIPMENT' && prod) return `Shipment: ${qty} carton(s) of ${prod.name} to ${prod.customer}`;
            return '';
        };

        // Handle Split Logic
        let finalOriginalCartons = formData.cartonsShipped;
        let splitTransaction: Transaction | undefined = undefined;

        if (isSplitMode && canSplit && splitData.quantity) {
            const splitQty = parseFloat(splitData.quantity);
            if (splitQty > 0 && splitQty < formData.cartonsShipped) {
                finalOriginalCartons = formData.cartonsShipped - splitQty;
                
                // Create New Transaction
                splitTransaction = {
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    date: new Date(splitData.date).toISOString(),
                    type: transaction.type,
                    description: getDescription('PRODUCTION', splitQty, product),
                    details: [], // Will be empty for PRODUCTION/SHIPMENT as they are calc'd
                    orderNumber: splitData.orderNumber || undefined,
                    productId: formData.productId as ProductId,
                    cartonsShipped: splitQty
                };
            } else {
                alert("Invalid split quantity. Must be greater than 0 and less than total.");
                return;
            }
        }

        // Update Original Transaction
        const updatedDescription = getDescription(
            transaction.type === 'IN' ? 'IN' : (transaction.type === 'SHIPMENT' ? 'SHIPMENT' : 'PRODUCTION'),
            finalOriginalCartons,
            product,
            item
        );

        const updatedTransaction: Transaction = {
            ...transaction,
            date: new Date(formData.date).toISOString(),
            orderNumber: formData.orderNumber || undefined,
            details: transaction.type === 'IN' ? updatedDetails : [], 
            description: updatedDescription,
            productId: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') && formData.productId ? formData.productId as ProductId : undefined,
            cartonsShipped: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') ? finalOriginalCartons : undefined,
        };

        onSave(updatedTransaction, splitTransaction);
    };

    const getTitle = () => {
        if (transaction.type === 'IN') return "Edit Incoming Stock";
        if (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') return "Edit Production Log";
        if (transaction.type === 'SHIPMENT') return "Edit Shipment Log";
        return "Edit Transaction";
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
                <label className="block text-sm font-medium">{label} {isSplitMode && "(Total)"}</label>
                <input type="number" name="cartonsShipped" value={formData.cartonsShipped} onChange={handleChange} className="mt-1 block w-full input-base" min="1" required disabled={isSplitMode}/>
                {isSplitMode && <p className="text-xs text-gray-500 mt-1">Total before splitting. Adjust split below.</p>}
            </div>
        </>
    );
    
    const renderSplitUI = () => {
        const originalAmount = formData.cartonsShipped || 0;
        const splitAmount = parseFloat(splitData.quantity) || 0;
        const remainingAmount = Math.max(0, originalAmount - splitAmount);

        return (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-3 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm8.486-.486a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"></path></svg>
                    Split Transaction
                </h4>
                
                <div className="grid grid-cols-2 gap-4">
                    {/* Original Remainder */}
                    <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                         <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Original Log (Remainder)</p>
                         <div className="text-2xl font-mono font-bold text-gray-800 dark:text-white">{remainingAmount}</div>
                         <div className="text-xs text-gray-400">cartons</div>
                    </div>

                    {/* New Split Transaction */}
                     <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 shadow-sm ring-1 ring-blue-200 dark:ring-blue-800">
                         <p className="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold mb-2">New Transaction</p>
                         
                         <div className="space-y-2">
                             <div>
                                 <label className="block text-xs text-gray-500">Quantity</label>
                                 <input 
                                    type="number" 
                                    name="quantity" 
                                    value={splitData.quantity} 
                                    onChange={handleSplitChange} 
                                    className="w-full text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1" 
                                    placeholder="Amount to split"
                                    max={originalAmount - 1}
                                 />
                             </div>
                              <div>
                                 <label className="block text-xs text-gray-500">Date</label>
                                 <input 
                                    type="date" 
                                    name="date" 
                                    value={splitData.date} 
                                    onChange={handleSplitChange} 
                                    className="w-full text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1" 
                                 />
                             </div>
                              <div>
                                 <label className="block text-xs text-gray-500">Ref #</label>
                                 <input 
                                    type="text" 
                                    name="orderNumber" 
                                    value={splitData.orderNumber} 
                                    onChange={handleSplitChange} 
                                    className="w-full text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1" 
                                    placeholder="Optional"
                                 />
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDetailedProductionTable = () => {
        if (!inventory) return null;

        // Determine quantity for simulation:
        // If splitting, we check the "Remainder" of the original transaction logic (simulating the edit).
        let simulationQty = formData.cartonsShipped;
        if (isSplitMode && canSplit) {
             const splitQty = parseFloat(splitData.quantity) || 0;
             simulationQty = Math.max(0, formData.cartonsShipped - splitQty);
        }

        // Create a map of original deductions to "add back" to simulated stock
        const originalDeductionsMap = new Map<InventoryItemId, number>();
        if (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') {
             if (transaction.productId && transaction.cartonsShipped) {
                  const originalCalc = calculateDeductions(transaction.productId, transaction.cartonsShipped, settings);
                  originalCalc.forEach(d => originalDeductionsMap.set(d.itemId, Math.abs(d.quantity)));
             } else {
                  transaction.details.forEach(d => originalDeductionsMap.set(d.itemId, Math.abs(d.quantity)));
             }
        }

        return (
            <div className="pt-2">
                <h4 className="text-sm font-semibold mb-2">
                    Material Breakdown & Stock Check 
                    {isSplitMode ? <span className="text-gray-500 font-normal text-xs ml-1">(Based on Remainder)</span> : null}:
                </h4>
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

    const renderShipmentStockCheck = () => {
        if (!productInventory || !formData.productId) return null;

        const product = FINISHED_PRODUCTS.find(p => p.id === formData.productId);
        if (!product) return null;

        const currentStock = productInventory[formData.productId as ProductId] || 0;
        const isSameProduct = transaction.productId === formData.productId;
        const originalAmount = (isSameProduct && transaction.cartonsShipped) ? transaction.cartonsShipped : 0;
        
        const effectiveStock = currentStock + originalAmount;
        const required = formData.cartonsShipped; // Split logic not applied to Shipments yet per request, but logic is similar
        const remaining = effectiveStock - required;
        const isShortage = remaining < 0;

        return (
             <div className="pt-2">
                <h4 className="text-sm font-semibold mb-2">Finished Goods Stock Check:</h4>
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                     <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                             <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ship</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr className={`text-xs ${isShortage ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}`}>
                                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{product.name}</td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{required}</td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{effectiveStock}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>
                                        {remaining}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-1 italic">
                    * Stock includes the original shipment amount added back.
                </p>
            </div>
        );
    };

    const renderStockInImpact = () => {
        if (!inventory || !formData.itemId) return null;

        const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
        if (!item) return null;

        const currentStock = inventory[formData.itemId as InventoryItemId] || 0;
        const originalDetail = transaction.details.find(d => d.itemId === formData.itemId);
        const originalContribution = originalDetail ? originalDetail.quantity : 0;

        const baseStock = currentStock - originalContribution;
        const addingQty = formData.quantity;
        const newTotal = baseStock + addingQty;
        
        const formatVal = (val: number) => item.unit === 'rolls' ? val.toFixed(2) : val.toLocaleString(undefined, { maximumFractionDigits: 0 });

        return (
             <div className="pt-2">
                <h4 className="text-sm font-semibold mb-2">Inventory Impact:</h4>
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                     <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                             <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Adding</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Base Stock</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr className="bg-white dark:bg-gray-800 text-xs">
                                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.name}</td>
                                    <td className="px-3 py-2 text-right font-mono text-green-600 dark:text-green-400">+{formatVal(addingQty)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{formatVal(baseStock)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                                        {formatVal(newTotal)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                 <p className="text-xs text-gray-400 mt-1 italic">
                    * Base Stock is current stock minus the original entry amount (if applicable).
                </p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-full overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{getTitle()}</h3>
                         {canSplit && (
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-600 dark:text-gray-300">Split</span>
                                <button 
                                    type="button"
                                    onClick={() => setIsSplitMode(!isSplitMode)}
                                    className={`${isSplitMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                                >
                                    <span className={`${isSplitMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}/>
                                </button>
                            </div>
                        )}
                    </div>

                    {transaction.type === 'IN' && renderStockInForm()}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && renderProductForm("Cartons Produced")}
                    {transaction.type === 'SHIPMENT' && renderProductForm("Cartons Shipped")}
                    
                    {isSplitMode && renderSplitUI()}

                    {!isSplitMode && (
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
                    )}

                    {/* Detailed Tables based on Transaction Type */}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && inventory ? (
                        renderDetailedProductionTable()
                    ) : (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') ? (
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

                    {transaction.type === 'SHIPMENT' && productInventory && renderShipmentStockCheck()}
                    {transaction.type === 'IN' && inventory && renderStockInImpact()}

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
