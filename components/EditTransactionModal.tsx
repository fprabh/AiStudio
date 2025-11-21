
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, InventoryItemId, ProductId, InventoryState, ProductState, LotState } from '../types';
import { useInventory } from '../hooks/useInventory';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS, getProductLotConfig } from '../constants';
import { calculateDeductions } from '../utils';

type EditModalProps = {
    transaction: Transaction;
    onClose: () => void;
    onSave: (transaction: Transaction) => void;
    settings: ReturnType<typeof useInventory>['settings'];
    inventory?: InventoryState; 
    productInventory?: ProductState;
    transactions?: Transaction[]; // For lot history lookup
    lotState?: LotState;
};

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const EditTransactionModal: React.FC<EditModalProps> = ({ transaction, onClose, onSave, settings, inventory, productInventory, transactions, lotState }) => {
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

    // Lot Allocation State for Shipments (Record<LotNumber, Quantity>)
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // Initialize allocations from transaction
    useEffect(() => {
        if (transaction.type === 'SHIPMENT' && transaction.lotAllocations) {
            setAllocations(transaction.lotAllocations);
        }
    }, [transaction]);

    // Get Available Lots for the selected product
    const availableLots = useMemo(() => {
        if (transaction.type !== 'SHIPMENT' || !formData.productId || !transactions || !lotState) return [];
        
        // 1. Find relevant production transactions to get dates
        const productionTxs = transactions.filter(
            t => t.type === 'PRODUCTION' && t.productId === formData.productId && t.orderNumber
        );

        // 2. Aggregate to find earliest date per lot
        const uniqueLots = new Map<string, string>();
        productionTxs.forEach(t => {
            const lot = t.orderNumber!;
            const current = uniqueLots.get(lot);
            if (!current || new Date(t.date) < new Date(current)) {
                uniqueLots.set(lot, t.date);
            }
        });

        // 3. Map to remaining balance, including current allocation for this transaction being edited
        const aggregated = Array.from(uniqueLots.entries()).map(([lot, date]) => {
            // Add back what was allocated in this specific transaction to see the 'effective' available amount for it
            const currentAllocatedHere = transaction.lotAllocations?.[lot] || 0;
            const remaining = (lotState[lot] || 0) + currentAllocatedHere;
            return { lot, date, remaining };
        }).filter(l => l.remaining > 0);

        // 4. Sort by Lot Sequence (Low to High), then Date
        return aggregated.sort((a, b) => {
             const getSeq = (str: string) => {
                  const match = str.match(/(\d+)$/);
                  return match ? parseInt(match[0], 10) : 0;
              };
              const seqA = getSeq(a.lot);
              const seqB = getSeq(b.lot);
              
              if (seqA !== 0 && seqB !== 0 && seqA !== seqB) {
                  return seqA - seqB;
              }
              
              if (seqA === seqB && a.lot !== b.lot) {
                  return a.lot.localeCompare(b.lot, undefined, { numeric: true });
              }
    
              return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    }, [formData.productId, transactions, lotState, transaction]);


    const updatedDetails = useMemo(() => {
        let effectiveCartons = formData.cartonsShipped;
        
        if ((transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && formData.productId && effectiveCartons > 0) {
            // Calculates raw material usage for Preview only
            return calculateDeductions(formData.productId as ProductId, effectiveCartons, settings);
        } else if (transaction.type === 'IN' && formData.itemId && formData.quantity > 0) {
            const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
            if (!item) return [];
            return [{ itemId: item.id, itemName: item.name, quantity: formData.quantity }];
        }
        return transaction.details || []; 
    }, [formData, settings, transaction.type, transaction.details]);

    const lotStats = useMemo(() => {
        if ((transaction.type !== 'PRODUCTION' && transaction.type !== 'OUT') || !formData.orderNumber || !formData.productId || !transactions) return null;
        
        // Calculate total produced for this lot (excluding current if editing, then adding new value)
        let totalProduced = 0;
        transactions.forEach(t => {
            if ((t.type === 'PRODUCTION' || t.type === 'OUT') && t.orderNumber === formData.orderNumber && t.id !== transaction.id) {
                totalProduced += (t.cartonsShipped || 0);
            }
        });
        totalProduced += formData.cartonsShipped;

        const config = getProductLotConfig(formData.productId as ProductId, settings);
        
        return {
            produced: totalProduced,
            max: config.maxCartons,
            remaining: config.maxCartons - totalProduced
        };
    }, [transaction, formData, transactions, settings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const isNumber = e.target.type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }));
    };

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
        if (formData.cartonsShipped <= 0) return;
        
        const newAllocations: Record<string, number> = {};
        let remainingToFill = formData.cartonsShipped;

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
        
        // Base Updates
        const item = ITEMS_MAP.get(formData.itemId as InventoryItemId);
        const product = FINISHED_PRODUCTS.find(p => p.id === formData.productId);
        
        const getDescription = (type: string, qty: number, prod?: typeof product, it?: typeof item) => {
            if (type === 'IN' && it) return `Stock Received: ${it.name} ${formData.notes ? `(${formData.notes})` : ''}`;
            if (type === 'PRODUCTION' && prod) return `Production: ${qty} carton(s) of ${prod.name}`;
            if (type === 'SHIPMENT' && prod) return `Shipment: ${qty} carton(s) of ${prod.name} to ${prod.customer}`;
            return '';
        };

        // Update Original Transaction
        const updatedDescription = getDescription(
            transaction.type === 'IN' ? 'IN' : (transaction.type === 'SHIPMENT' ? 'SHIPMENT' : 'PRODUCTION'),
            formData.cartonsShipped,
            product,
            item
        );
        
        let updatedLotAllocations: Record<string, number> | undefined = undefined;
        if (transaction.type === 'SHIPMENT' && Object.keys(allocations).length > 0) {
            updatedLotAllocations = allocations;
        }

        const updatedTransaction: Transaction = {
            ...transaction,
            date: new Date(formData.date).toISOString(),
            orderNumber: formData.orderNumber || undefined,
            details: transaction.type === 'IN' ? updatedDetails : [], 
            description: updatedDescription,
            productId: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') && formData.productId ? formData.productId as ProductId : undefined,
            cartonsShipped: (transaction.type === 'PRODUCTION' || transaction.type === 'SHIPMENT' || transaction.type === 'OUT') ? formData.cartonsShipped : undefined,
            lotAllocations: updatedLotAllocations
        };

        onSave(updatedTransaction);
    };

    const getTitle = () => {
        if (transaction.id.startsWith('new-')) {
             if (transaction.type === 'IN') return "Add Incoming Stock";
             if (transaction.type === 'SHIPMENT') return "Log Shipment";
             return "Log Production";
        }
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
                <label className="block text-sm font-medium">{label}</label>
                <input type="number" name="cartonsShipped" value={formData.cartonsShipped} onChange={handleChange} className="mt-1 block w-full input-base" min="1" required />
            </div>
        </>
    );

    const renderLotAllocationTable = () => {
        if (transaction.type !== 'SHIPMENT') return null;
        
        const totalAllocated = Object.values(allocations).reduce((sum, qty) => sum + qty, 0);
        const unallocated = Math.max(0, formData.cartonsShipped - totalAllocated);

        return (
             <div className="pt-2">
                <div className="flex justify-between items-end mb-2">
                    <h4 className="text-sm font-semibold">Lot Allocations</h4>
                     <div className="flex items-center space-x-3">
                        <button
                            type="button"
                            onClick={handleAutoFill}
                            className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50 transition-colors uppercase font-medium"
                        >
                            Auto Fill
                        </button>
                        <div className="text-xs">
                             <span className="text-gray-500 dark:text-gray-400 mr-2">Required: <span className="font-bold">{formData.cartonsShipped}</span></span>
                             <span className={totalAllocated !== formData.cartonsShipped ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                                 Allocated: {totalAllocated}
                             </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                    <div className="overflow-x-auto max-h-48">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Lot Number</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avail</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">Alloc</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                {availableLots.length > 0 ? (
                                    availableLots.map((lot) => {
                                        const isAllocated = (allocations[lot.lot] || 0) > 0;
                                        return (
                                            <tr key={lot.lot} className={isAllocated ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                                                <td className="px-3 py-2 text-xs font-mono text-gray-900 dark:text-white whitespace-nowrap">
                                                    {lot.lot}
                                                </td>
                                                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                    {new Date(lot.date).toLocaleDateString()}
                                                </td>
                                                <td className="px-3 py-2 text-xs text-right font-mono text-gray-700 dark:text-gray-300">
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
                                                            className="block w-16 text-right text-xs border-gray-300 rounded-md shadow-sm focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-600 dark:text-white p-1"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400 italic">
                                            No available lots found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };
    
    const renderDetailedProductionTable = () => {
        if (!inventory) return null;

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
                    Material Breakdown & Stock Check:
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
        const required = formData.cartonsShipped;
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{getTitle()}</h3>
                    </div>

                    {transaction.type === 'IN' && renderStockInForm()}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && renderProductForm("Cartons Produced")}
                    {transaction.type === 'SHIPMENT' && renderProductForm("Cartons Shipped")}
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium">Date</label>
                            <input type="date" name="date" value={formData.date} onChange={handleChange} className="mt-1 block w-full input-base" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">
                                {transaction.type === 'PRODUCTION' || transaction.type === 'OUT' ? 'Lot Number' : 'Reference Number'}
                            </label>
                            <input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleChange} className="mt-1 block w-full input-base font-mono" />
                        </div>
                    </div>
                    
                    {lotStats && (
                        <div className="mt-2 text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between mb-1">
                                 <span className="font-semibold text-gray-700 dark:text-gray-300">Lot Capacity Usage:</span>
                                 <span className={`font-mono ${lotStats.remaining < 0 ? "text-red-600 font-bold" : "text-gray-600 dark:text-gray-300"}`}>
                                     {lotStats.produced} / {lotStats.max}
                                 </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-600">
                                <div className={`h-1.5 rounded-full ${lotStats.remaining < 0 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (lotStats.produced / lotStats.max) * 100)}%` }}></div>
                            </div>
                            {lotStats.remaining < 0 && <p className="text-red-500 mt-1 font-semibold">Warning: Exceeds lot capacity.</p>}
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
                    
                    {/* Render Lot Allocation Table BELOW Finished Goods Check */}
                    {renderLotAllocationTable()}

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
