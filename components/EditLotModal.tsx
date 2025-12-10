
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, InventoryItemId, AppSettings, InventoryState, ProductId, LotMetadata } from '../types';
import { INVENTORY_ITEMS } from '../constants';
import { LotAggregated } from './LotHistory';
import ConfirmationModal from './ConfirmationModal';

interface EditLotModalProps {
    lot: LotAggregated;
    allTransactions: Transaction[];
    settings: AppSettings;
    inventory: InventoryState;
    onClose: () => void;
    onSave: (updatedTransactions: Transaction[], deletedTransactionIds: string[], lotMeta: LotMetadata) => void;
}

type LocalTransactionState = Transaction & {
    _isEditingMaterials: boolean;
    _materialSelection: Partial<Record<InventoryItemId, string[]>>;
};

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const EditLotModal: React.FC<EditLotModalProps> = ({ lot, allTransactions, settings, inventory, onClose, onSave }) => {
    const [editedLotNumber, setEditedLotNumber] = useState(lot.lotNumber);
    const [localTransactions, setLocalTransactions] = useState<LocalTransactionState[]>([]);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [txToDelete, setTxToDelete] = useState<string | null>(null);

    // Metadata State
    const [startDate, setStartDate] = useState(lot.startDate || '');
    const [endDate, setEndDate] = useState(lot.endDate || '');

    // Calculate available stock IDs for ALL products associated with this lot
    const availableStockIds = useMemo(() => {
        const map: Partial<Record<InventoryItemId, string[]>> = {};
        
        // Iterate through all product IDs in this lot to gather all required raw materials
        lot.productIds.forEach(pid => {
            const formula = settings.productFormulas[pid as ProductId];
            if (!formula) return;
            
            const requiredItems = (Object.values(formula.rawMaterials) as InventoryItemId[]).filter(id => !settings.bypassedItems[id]);
            
            requiredItems.forEach(itemId => {
                // If we already calculated this item from another product, skip
                if (map[itemId]) return;

                const ids = new Set<string>();
                allTransactions.forEach(t => {
                    if (t.type === 'IN') {
                        t.details.forEach(detail => {
                            if (detail.itemId === itemId && detail.stockId) {
                                ids.add(detail.stockId);
                            }
                        });
                    }
                });
                map[itemId] = Array.from(ids).sort();
            });
        });
        
        return map;
    }, [lot.productIds, settings.productFormulas, settings.bypassedItems, allTransactions]);

    useEffect(() => {
        const lotTransactions = allTransactions
            .filter(t => t.orderNumber === lot.lotNumber && (t.type === 'PRODUCTION' || t.type === 'OUT'))
            .map(t => {
                const sel: Partial<Record<InventoryItemId, string[]>> = {};
                if (t.materialLinkage) {
                    Object.entries(t.materialLinkage).forEach(([itemId, val]) => {
                        const itemKey = itemId as InventoryItemId;
                        // Handle legacy string vs array
                        sel[itemKey] = Array.isArray(val) ? val : [val as string];
                    });
                }
                return { 
                    ...t, 
                    _isEditingMaterials: false,
                    _materialSelection: sel,
                };
            })
            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setLocalTransactions(lotTransactions);
        setEditedLotNumber(lot.lotNumber);
        setDeletedIds(new Set());
        setStartDate(lot.startDate || '');
        setEndDate(lot.endDate || '');
    }, [lot, allTransactions]);

    const handleTransactionChange = (id: string, field: 'date' | 'cartonsShipped', value: string | number) => {
        setLocalTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, [field]: value } : tx));
    };
    
    const toggleMaterialEdit = (id: string) => {
        setLocalTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, _isEditingMaterials: !tx._isEditingMaterials } : tx));
    };

    const handleAddStockId = (txId: string, itemId: InventoryItemId, stockId: string) => {
        if (!stockId) return;
        setLocalTransactions(prev => prev.map(tx => {
            if (tx.id === txId) {
                const current = tx._materialSelection[itemId] || [];
                if (current.includes(stockId)) return tx;
                return { 
                    ...tx, 
                    _materialSelection: { ...tx._materialSelection, [itemId]: [...current, stockId] } 
                };
            }
            return tx;
        }));
    };

    const handleRemoveStockId = (txId: string, itemId: InventoryItemId, stockId: string) => {
        setLocalTransactions(prev => prev.map(tx => {
            if (tx.id === txId) {
                const current = tx._materialSelection[itemId] || [];
                return { 
                    ...tx, 
                    _materialSelection: { ...tx._materialSelection, [itemId]: current.filter(id => id !== stockId) } 
                };
            }
            return tx;
        }));
    };
    
    const handleDeleteClick = (id: string) => setTxToDelete(id);

    const confirmDelete = () => {
        if (!txToDelete) return;
        setDeletedIds(prev => new Set(prev).add(txToDelete));
        setLocalTransactions(prev => prev.filter(tx => tx.id !== txToDelete));
        setTxToDelete(null);
    };

    const handleSave = () => {
        const updated = localTransactions.map(tx => {
            const finalTx: Transaction = {
                id: tx.id,
                date: new Date(tx.date).toISOString(),
                type: tx.type,
                description: tx.description,
                details: [],
                orderNumber: editedLotNumber,
                productId: tx.productId,
                cartonsShipped: tx.cartonsShipped,
                materialLinkage: undefined
            };
            
            const linkage: Partial<Record<InventoryItemId, string[]>> = {};
            Object.entries(tx._materialSelection).forEach(([itemId, val]) => {
                const stockIds = val as string[] | undefined;
                if (stockIds && stockIds.length > 0) {
                    linkage[itemId as InventoryItemId] = stockIds;
                }
            });

            if (Object.keys(linkage).length > 0) {
                finalTx.materialLinkage = linkage;
            }
            
            return finalTx;
        });

        const metadata: LotMetadata = {
            startDate: startDate || undefined,
            endDate: endDate || undefined
        };

        onSave(updated, Array.from(deletedIds), metadata);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <ConfirmationModal 
                isOpen={!!txToDelete}
                onClose={() => setTxToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Production Entry"
                message="Are you sure you want to delete this specific production entry from the lot? This cannot be undone."
            />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Manage Lot Details</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Editing {lot.productNames.join(' & ')} for {lot.customer}
                    </p>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lot Number</label>
                        <input 
                            type="text" 
                            value={editedLotNumber} 
                            onChange={e => setEditedLotNumber(e.target.value)}
                            className="mt-1 block w-full sm:w-1/2 font-mono pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lot Start Date</label>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 mt-1">Leave blank to show 'Set Date'.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lot End Date</label>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <h4 className="text-md font-semibold text-gray-800 dark:text-white">Production Entries</h4>
                        {localTransactions.map(tx => {
                            // Determine raw materials based on THIS transaction's product ID
                            const txProductId = tx.productId as ProductId;
                            const txFormula = settings.productFormulas[txProductId];

                            return (
                                <div key={tx.id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                                            <input 
                                                type="date" 
                                                value={new Date(tx.date).toISOString().split('T')[0]}
                                                onChange={e => handleTransactionChange(tx.id, 'date', e.target.value)}
                                                className="mt-1 block w-full input-sm-base"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Cartons</label>
                                            <input 
                                                type="number" 
                                                value={tx.cartonsShipped}
                                                onChange={e => handleTransactionChange(tx.id, 'cartonsShipped', parseFloat(e.target.value) || 0)}
                                                className="mt-1 block w-full input-sm-base"
                                            />
                                        </div>
                                        <div className="md:col-span-2 flex items-center justify-end space-x-3">
                                            <button onClick={() => toggleMaterialEdit(tx.id)} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                                                {tx._isEditingMaterials ? 'Hide Materials' : 'Edit Materials'}
                                            </button>
                                            <button onClick={() => handleDeleteClick(tx.id)} className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium">
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    {/* Display Product Name Context */}
                                    <div className="mt-1 text-xs text-gray-400">
                                        Product: {tx.description.split(' of ')[1] || 'Unknown'}
                                    </div>

                                    {tx._isEditingMaterials && txFormula && (
                                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                            <h5 className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase mb-2">Raw Material Links</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {(Object.values(txFormula.rawMaterials) as InventoryItemId[])
                                                .filter(id => !settings.bypassedItems[id])
                                                .map(itemId => {
                                                    const item = ITEMS_MAP.get(itemId);
                                                    const stockIds = availableStockIds[itemId] || [];
                                                    const selectedIds = tx._materialSelection[itemId] || [];

                                                    return (
                                                         <div key={itemId}>
                                                             <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 truncate">{item?.name}</label>
                                                             
                                                             {/* Tags */}
                                                             <div className="flex flex-wrap gap-2 mb-2">
                                                                 {selectedIds.length > 0 ? selectedIds.map(sid => (
                                                                     <span key={sid} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 shadow-sm text-gray-700 dark:text-gray-200">
                                                                         {sid}
                                                                         <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveStockId(tx.id, itemId, sid)}
                                                                            className="ml-1.5 text-gray-400 hover:text-red-500 focus:outline-none"
                                                                         >
                                                                             <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                                                                 <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                             </svg>
                                                                         </button>
                                                                     </span>
                                                                 )) : (
                                                                     <span className="text-xs text-gray-400 italic mb-1">No batches linked</span>
                                                                 )}
                                                             </div>

                                                             <select
                                                                 value=""
                                                                 onChange={e => handleAddStockId(tx.id, itemId, e.target.value)}
                                                                 className="block w-full text-xs py-1.5 pl-2 pr-8 border-gray-300 rounded focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-500 dark:text-white mb-2"
                                                             >
                                                                 <option value="" disabled>+ Add Batch/Roll</option>
                                                                 {stockIds.map(id => (
                                                                     <option key={id} value={id} disabled={selectedIds.includes(id)}>{id}</option>
                                                                 ))}
                                                             </select>
                                                         </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 dark:border-gray-500">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700">
                        Save Changes
                    </button>
                </div>
            </div>
             <style>{`
                .input-sm-base {
                    display: block;
                    width: 100%;
                    padding: 0.25rem 0.5rem;
                    font-size: 0.875rem;
                    line-height: 1.25rem;
                    border-width: 1px;
                    border-color: #D1D5DB;
                    border-radius: 0.375rem;
                }
                .dark .input-sm-base {
                    background-color: #374151;
                    border-color: #4B5563;
                    color: #FFFFFF;
                }
                .input-sm-base:focus {
                     outline: 2px solid transparent;
                     outline-offset: 2px;
                     --tw-ring-color: #B11E31;
                     border-color: #B11E31;
                }
            `}</style>
        </div>
    );
};

export default EditLotModal;
