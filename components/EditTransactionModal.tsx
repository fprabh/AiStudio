
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, InventoryItemId, ProductId, InventoryState, ProductState, LotState, TransactionDetail } from '../types';
import { useInventory } from '../hooks/useInventory';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS, getProductLotConfig } from '../constants';
import { calculateDeductions, compressImage } from '../utils';

type EditModalProps = {
    transaction: Transaction;
    onClose: () => void;
    onSave: (transaction: Transaction) => void;
    settings: ReturnType<typeof useInventory>['settings'];
    inventory?: InventoryState; 
    productInventory?: ProductState;
    transactions?: Transaction[]; // For lot history lookup
    lotState?: LotState;
    allowMaterialEditing?: boolean;
};

// Updated type to allow empty string for itemId during UI editing
type ItemLine = Omit<TransactionDetail, 'itemName' | 'itemId'> & { uniqueId: number; itemId: InventoryItemId | '' };

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const EditTransactionModal: React.FC<EditModalProps> = ({ transaction, onClose, onSave, settings, inventory, productInventory, transactions, lotState, allowMaterialEditing = true }) => {
    const [date, setDate] = useState(new Date(transaction.date).toISOString().split('T')[0]);
    const [orderNumber, setOrderNumber] = useState(transaction.orderNumber || '');

    // State for Stock In
    const [itemLines, setItemLines] = useState<ItemLine[]>([]);

    // State for Production/Shipment
    const [productId, setProductId] = useState<ProductId | ''>(transaction.productId || '');
    const [cartonsShipped, setCartonsShipped] = useState(transaction.cartonsShipped || 0);

    // Lot Allocation State for Shipments (Record<LotNumber, Quantity>)
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // Material Traceability State for Production (Multi-select)
    const [materialSelection, setMaterialSelection] = useState<Partial<Record<InventoryItemId, string[]>>>({});

    // Scrap State
    const [scrapItemId, setScrapItemId] = useState<InventoryItemId | ''>('');
    const [scrapQuantity, setScrapQuantity] = useState('');
    const [scrapReason, setScrapReason] = useState('');

    // Photo Proof State
    const [photos, setPhotos] = useState<string[]>(transaction.photos || []);

    // Initialize states based on transaction type
    useEffect(() => {
        if (transaction.type === 'IN') {
             setItemLines(transaction.details.map((d, i) => ({
                uniqueId: Date.now() + i,
                itemId: d.itemId,
                quantity: d.quantity,
                stockId: d.stockId || '',
                notes: d.notes || ''
            })));
        }
        if (transaction.type === 'SHIPMENT' && transaction.lotAllocations) {
            setAllocations(transaction.lotAllocations);
        }
        if (transaction.type === 'SCRAP' && transaction.details.length > 0) {
            setScrapItemId(transaction.details[0].itemId);
            setScrapQuantity(Math.abs(transaction.details[0].quantity).toString());
            setScrapReason(transaction.details[0].notes || '');
        }
    }, [transaction]);

    // Derived: Required Raw Materials for Traceability (Production)
    const requiredTraceabilityItems = useMemo(() => {
        if ((transaction.type !== 'PRODUCTION' && transaction.type !== 'OUT') || !productId) return [];
        const formula = settings.productFormulas[productId as ProductId];
        if (!formula) return [];

        const items: InventoryItemId[] = [];
        Object.values(formula.rawMaterials).forEach(id => {
             const item = ITEMS_MAP.get(id as InventoryItemId);
             // Updated: Include item even if bypassed (Capacity Exempt)
             if (item) {
                 items.push(item.id);
             }
        });
        return items;
    }, [productId, settings, transaction.type]);

    // Derived: Available Stock IDs for those items
    const availableStockIds = useMemo(() => {
        if (!transactions) return {};
        const map: Partial<Record<InventoryItemId, string[]>> = {};
        
        requiredTraceabilityItems.forEach(itemId => {
            const ids = new Set<string>();
            transactions.forEach(t => {
                if (t.type === 'IN') {
                    t.details.forEach(d => {
                        if (d.itemId === itemId && d.stockId) {
                            ids.add(d.stockId);
                        }
                    });
                }
            });
            map[itemId] = Array.from(ids).sort();
        });
        return map;
    }, [requiredTraceabilityItems, transactions]);

    // Initialize Material Selection state from existing transaction data
    useEffect(() => {
         if ((transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && transaction.materialLinkage && requiredTraceabilityItems.length > 0) {
            const sel: any = {};
            
            Object.entries(transaction.materialLinkage).forEach(([itemId, val]) => {
                const itemKey = itemId as InventoryItemId;
                sel[itemKey] = Array.isArray(val) ? val : [val];
            });
            setMaterialSelection(sel);
         }
    }, [transaction, availableStockIds, requiredTraceabilityItems]);

    // Get Available Lots for the selected product (Shipment)
    const availableLots = useMemo(() => {
        if (transaction.type !== 'SHIPMENT' || !productId || !transactions || !lotState) return [];
        
        const productionTxs = transactions.filter(t => t.type === 'PRODUCTION' && t.productId === productId && t.orderNumber);
        const uniqueLots = new Map<string, string>();
        productionTxs.forEach(t => {
            const lot = t.orderNumber!;
            const current = uniqueLots.get(lot);
            if (!current || new Date(t.date) < new Date(current)) {
                uniqueLots.set(lot, t.date);
            }
        });

        const aggregated = Array.from(uniqueLots.entries()).map(([lot, date]) => {
            const currentAllocatedHere = transaction.lotAllocations?.[lot] || 0;
            const remaining = (lotState[lot] || 0) + currentAllocatedHere;
            return { lot, date, remaining };
        }).filter(l => l.remaining > 0);

        return aggregated.sort((a, b) => {
             const getSeq = (str: string) => {
                  const match = str.match(/(\d+)$/);
                  return match ? parseInt(match[0], 10) : 0;
              };
              const seqA = getSeq(a.lot);
              const seqB = getSeq(b.lot);
              if (seqA !== 0 && seqB !== 0 && seqA !== seqB) return seqA - seqB;
              if (seqA === seqB && a.lot !== b.lot) return a.lot.localeCompare(b.lot, undefined, { numeric: true });
              return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    }, [productId, transactions, lotState, transaction]);

    const productionDeductionDetails = useMemo(() => {
        if ((transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && productId && cartonsShipped > 0) {
            return calculateDeductions(productId as ProductId, cartonsShipped, settings, transaction.extraRejection || 0);
        }
        return [];
    }, [productId, cartonsShipped, settings, transaction.type, transaction.extraRejection]);

    const lotStats = useMemo(() => {
        if ((transaction.type !== 'PRODUCTION' && transaction.type !== 'OUT') || !orderNumber || !productId || !transactions) return null;
        
        let totalProduced = 0;
        transactions.forEach(t => {
            if ((t.type === 'PRODUCTION' || t.type === 'OUT') && t.orderNumber === orderNumber && t.id !== transaction.id) {
                totalProduced += (t.cartonsShipped || 0);
            }
        });
        totalProduced += cartonsShipped;

        const config = getProductLotConfig(productId as ProductId, settings);
        
        return {
            produced: totalProduced,
            max: config.maxCartons,
            remaining: config.maxCartons - totalProduced
        };
    }, [transaction, orderNumber, productId, cartonsShipped, transactions, settings]);

    // HANDLERS for multi-item stock form
    const handleItemLineChange = (uniqueId: number, field: keyof Omit<ItemLine, 'uniqueId'>, value: string | number) => {
        setItemLines(prev => prev.map(line => line.uniqueId === uniqueId ? { ...line, [field]: value } : line));
    };
    const handleAddLine = () => setItemLines(prev => [...prev, { uniqueId: Date.now(), itemId: '', quantity: 0, stockId: '', notes: '' }]);
    const handleRemoveLine = (uniqueId: number) => setItemLines(prev => prev.filter(line => line.uniqueId !== uniqueId));
    
    // Handlers for Material Selection (Multi-select)
    const handleAddStockId = (itemId: InventoryItemId, stockId: string) => {
        if (!stockId) return;
        setMaterialSelection(prev => {
            const current = prev[itemId] || [];
            if (current.includes(stockId)) return prev;
            return { ...prev, [itemId]: [...current, stockId] };
        });
    };

    const handleRemoveStockId = (itemId: InventoryItemId, stockId: string) => {
        setMaterialSelection(prev => {
            const current = prev[itemId] || [];
            return { ...prev, [itemId]: current.filter(id => id !== stockId) };
        });
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
        if (cartonsShipped <= 0) return;
        
        const newAllocations: Record<string, number> = {};
        let remainingToFill = cartonsShipped;

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

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const remainingSlots = 5 - photos.length;
            const filesToProcess = files.slice(0, remainingSlots);
            
            if (filesToProcess.length > 0) {
                const processed = await Promise.all(filesToProcess.map(f => compressImage(f as File)));
                setPhotos(prev => [...prev, ...processed]);
            }
        }
    };
  
    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Construct a clean object to avoid polluting state with UI properties (e.g. stockId, itemName from views)
        const baseTx: Transaction = {
            id: transaction.id,
            date: new Date(date).toISOString(),
            type: transaction.type,
            description: '', // Will be updated below
            details: [],     // Will be updated below for IN transactions
            orderNumber: orderNumber || undefined,
            photos: photos.length > 0 ? photos : undefined,
            extraRejection: transaction.extraRejection // Preserve extra rejection if any
        };

        if (transaction.type === 'IN') {
            baseTx.description = `Stock Received ${orderNumber ? `(PO: ${orderNumber})` : '(No PO)'}`;
            baseTx.details = itemLines
                .filter(line => line.itemId && line.quantity > 0)
                .map(line => ({
                    itemId: line.itemId as InventoryItemId,
                    itemName: ITEMS_MAP.get(line.itemId as InventoryItemId)?.name || 'Unknown',
                    quantity: typeof line.quantity === 'string' ? parseFloat(line.quantity) : line.quantity,
                    stockId: line.stockId,
                    notes: line.notes
                }));
        } else if (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') {
            const product = FINISHED_PRODUCTS.find(p => p.id === productId);
            baseTx.description = `Production: ${cartonsShipped} carton(s) of ${product?.name}`;
            baseTx.productId = productId as ProductId;
            baseTx.cartonsShipped = cartonsShipped;
            
            if (allowMaterialEditing) {
                let updatedMaterialLinkage: Partial<Record<InventoryItemId, string[]>> | undefined = {};
                requiredTraceabilityItems.forEach(itemId => {
                    const selection = materialSelection[itemId];
                    if (selection && selection.length > 0) {
                        updatedMaterialLinkage![itemId] = selection;
                    }
                });
                if (Object.keys(updatedMaterialLinkage).length === 0) updatedMaterialLinkage = undefined;
                baseTx.materialLinkage = updatedMaterialLinkage;
            } else {
                 baseTx.materialLinkage = transaction.materialLinkage;
            }
        } else if (transaction.type === 'SHIPMENT') {
            const product = FINISHED_PRODUCTS.find(p => p.id === productId);
            baseTx.description = `Shipment: ${cartonsShipped} carton(s) of ${product?.name} to ${product?.customer}`;
            baseTx.productId = productId as ProductId;
            baseTx.cartonsShipped = cartonsShipped;
            baseTx.lotAllocations = Object.keys(allocations).length > 0 ? allocations : undefined;
        } else if (transaction.type === 'SCRAP') {
            const item = ITEMS_MAP.get(scrapItemId as InventoryItemId);
            baseTx.description = `Scrap: ${scrapQuantity} ${item?.unit} of ${item?.name}`;
            baseTx.details = [{
               itemId: scrapItemId as InventoryItemId,
               itemName: item?.name || 'Unknown',
               quantity: -Math.abs(parseFloat(scrapQuantity) || 0), // Ensure negative for deduction
               notes: scrapReason
            }];
        }
        
        onSave(baseTx);
    };

    const getTitle = () => {
        if (transaction.type === 'IN') return "Edit Incoming Stock";
        if (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') return "Edit Production Log";
        if (transaction.type === 'SHIPMENT') return "Edit Shipment Log";
        if (transaction.type === 'SCRAP') return "Edit Scrap Entry";
        return "Edit Transaction";
    };

    const renderMultiItemStockInForm = () => (
        <div className="space-y-4">
            {itemLines.map((line, index) => (
                <div key={line.uniqueId} className="grid grid-cols-12 gap-x-4 gap-y-2 items-end p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600">
                    <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Item*</label>
                        <select value={line.itemId} onChange={(e) => handleItemLineChange(line.uniqueId, 'itemId', e.target.value)} className="mt-1 block w-full input-sm-base" required>
                            <option value="" disabled>Select an item</option>
                            {INVENTORY_ITEMS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                    </div>
                     <div className="col-span-6 md:col-span-2">
                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity*</label>
                         <input type="number" value={line.quantity} onChange={(e) => handleItemLineChange(line.uniqueId, 'quantity', e.target.value)} step="any" min="0.0001" className="mt-1 block w-full input-sm-base" required />
                     </div>
                     <div className="col-span-6 md:col-span-2">
                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Stock ID</label>
                         <input type="text" value={line.stockId} onChange={(e) => handleItemLineChange(line.uniqueId, 'stockId', e.target.value)} className="mt-1 block w-full input-sm-base font-mono" />
                     </div>
                      <div className="col-span-10 md:col-span-3">
                         <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Notes</label>
                         <input type="text" value={line.notes} onChange={(e) => handleItemLineChange(line.uniqueId, 'notes', e.target.value)} className="mt-1 block w-full input-sm-base" />
                     </div>
                     <div className="col-span-2 md:col-span-1 flex justify-end">
                        <button type="button" onClick={() => handleRemoveLine(line.uniqueId)} className="p-2 text-gray-400 hover:text-red-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                     </div>
                </div>
            ))}
            <button type="button" onClick={handleAddLine} className="px-3 py-1.5 text-sm font-medium text-brand-red border border-brand-red rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">+ Add Item</button>
        </div>
    );

    const renderProductForm = (label: string) => (
         <>
            <div>
                <label className="block text-sm font-medium">Product</label>
                <select name="productId" value={productId} onChange={e => setProductId(e.target.value as ProductId)} className="mt-1 block w-full input-base" required>
                    {FINISHED_PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{label}</label>
                <input type="number" name="cartonsShipped" value={cartonsShipped} onChange={e => setCartonsShipped(parseFloat(e.target.value) || 0)} className="mt-1 block w-full input-base" min="1" required />
            </div>
        </>
    );

    const renderScrapForm = () => {
        const item = ITEMS_MAP.get(scrapItemId as InventoryItemId);
        return (
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Inventory Item</label>
                    <select
                        value={scrapItemId}
                        onChange={e => setScrapItemId(e.target.value as InventoryItemId)}
                        className="mt-1 block w-full input-base"
                        required
                    >
                        <option value="" disabled>Select an item</option>
                        {INVENTORY_ITEMS.map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Quantity to Scrap</label>
                    <div className="relative mt-1">
                        <input
                            type="number"
                            value={scrapQuantity}
                            onChange={e => setScrapQuantity(e.target.value)}
                            step="any"
                            min="0.0001"
                            className="block w-full pl-3 pr-12 py-2 border-gray-300 focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="0.00"
                            required
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">
                                {item?.unit || ''}
                            </span>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
                    <input
                        type="text"
                        value={scrapReason}
                        onChange={e => setScrapReason(e.target.value)}
                        className="mt-1 block w-full input-base"
                        placeholder="e.g., Damaged, Expired, Test Run"
                        required
                    />
                </div>
            </div>
        );
    };

    const renderMaterialTraceabilityForm = () => {
        if ((transaction.type !== 'PRODUCTION' && transaction.type !== 'OUT') || requiredTraceabilityItems.length === 0) return null;

        return (
            <div className="pt-2">
                 <h4 className="text-sm font-semibold mb-2">Raw Material Traceability</h4>
                 <div className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-md border border-gray-200 dark:border-gray-600 grid grid-cols-1 md:grid-cols-2 gap-4">
                     {requiredTraceabilityItems.map(itemId => {
                         const item = ITEMS_MAP.get(itemId);
                         const stockIds = availableStockIds[itemId] || [];
                         const selectedIds = materialSelection[itemId] || [];

                         return (
                             <div key={itemId}>
                                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 truncate">
                                     {item?.name || itemId}
                                 </label>
                                 
                                 {/* Tags */}
                                 <div className="flex flex-wrap gap-2 mb-2">
                                     {selectedIds.length > 0 ? selectedIds.map(sid => (
                                         <span key={sid} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 shadow-sm text-gray-700 dark:text-gray-200">
                                             {sid}
                                             <button
                                                type="button"
                                                onClick={() => handleRemoveStockId(itemId, sid)}
                                                className="ml-1.5 text-gray-400 hover:text-red-500 focus:outline-none"
                                             >
                                                 <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                                     <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                 </svg>
                                             </button>
                                         </span>
                                     )) : (
                                         <span className="text-xs text-gray-400 italic mb-1">No batches selected</span>
                                     )}
                                 </div>

                                 <select
                                     value=""
                                     onChange={e => handleAddStockId(itemId, e.target.value)}
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
        )
    };

    const renderLotAllocationTable = () => {
        if (transaction.type !== 'SHIPMENT') return null;
        
        const totalAllocated = Object.values(allocations).reduce<number>((sum, qty) => sum + (Number(qty) || 0), 0);
        
        return (
             <div className="pt-2">
                <div className="flex justify-between items-end mb-2">
                    <h4 className="text-sm font-semibold">Lot Allocations</h4>
                     <div className="flex items-center space-x-3">
                        <button type="button" onClick={handleAutoFill} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50 transition-colors uppercase font-medium">Auto Fill</button>
                        <div className="text-xs">
                             <span className="text-gray-500 dark:text-gray-400 mr-2">Required: <span className="font-bold">{cartonsShipped}</span></span>
                             <span className={totalAllocated !== cartonsShipped ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>Allocated: {totalAllocated}</span>
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
                                    availableLots.map((lot) => (
                                        <tr key={lot.lot} className={(allocations[lot.lot] || 0) > 0 ? "bg-blue-50 dark:bg-blue-900/20" : "odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50"}>
                                            <td className="px-3 py-2 text-xs font-mono text-gray-900 dark:text-white whitespace-nowrap">{lot.lot}</td>
                                            <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(lot.date).toLocaleDateString()}</td>
                                            <td className="px-3 py-2 text-xs text-right font-mono text-gray-700 dark:text-gray-300">{lot.remaining}</td>
                                            <td className="px-3 py-2"><div className="flex justify-end"><input type="number" min="0" max={lot.remaining} value={allocations[lot.lot] || ''} onChange={(e) => handleAllocationChange(lot.lot, e.target.value)} className="block w-16 text-right text-xs border-gray-300 rounded-md shadow-sm focus:ring-brand-red focus:border-brand-red dark:bg-gray-700 dark:border-gray-600 dark:text-white p-1" placeholder="0" /></div></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400 italic">No available lots found.</td></tr>
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
                  const originalCalc = calculateDeductions(transaction.productId, transaction.cartonsShipped, settings, transaction.extraRejection || 0);
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
                                {productionDeductionDetails.map(d => {
                                    const requiredQty = Math.abs(d.quantity);
                                    const originalQty = originalDeductionsMap.get(d.itemId) || 0;
                                    const currentStock = inventory[d.itemId] || 0;
                                    const effectiveStock = currentStock + originalQty;
                                    const remaining = effectiveStock - requiredQty;
                                    const isShortage = remaining < 0;
                                    const item = ITEMS_MAP.get(d.itemId);
                                    const formatVal = (val: number) => item?.unit === 'rolls' ? val.toFixed(2) : val.toLocaleString(undefined, { maximumFractionDigits: 0 });

                                    return (
                                        <tr key={d.itemId} className={`text-xs ${isShortage ? 'bg-red-50 dark:bg-red-900/20' : 'odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50'}`}>
                                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white truncate max-w-[120px]" title={d.itemName}>{d.itemName}</td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{formatVal(requiredQty)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300" title={`Current: ${formatVal(currentStock)} + Original: ${formatVal(originalQty)}`}>{formatVal(effectiveStock)}</td>
                                            <td className={`px-3 py-2 text-right font-mono font-bold ${isShortage ? 'text-red-600' : 'text-green-600'}`}>{formatVal(remaining)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-1 italic">* Stock column adds back the original deduction to simulate available inventory.</p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{getTitle()}</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full input-base" required />
                        </div>
                        {transaction.type !== 'SCRAP' && (
                            <div>
                                <label className="block text-sm font-medium">
                                    {transaction.type === 'IN' ? 'Vendor PO' : transaction.type === 'PRODUCTION' || transaction.type === 'OUT' ? 'Lot Number' : 'Reference Number'}
                                </label>
                                <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="mt-1 block w-full input-base font-mono" />
                            </div>
                        )}
                    </div>

                    {transaction.type === 'IN' && renderMultiItemStockInForm()}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && renderProductForm("Cartons Produced")}
                    {transaction.type === 'SHIPMENT' && renderProductForm("Cartons Shipped")}
                    {transaction.type === 'SCRAP' && renderScrapForm()}

                    {/* Photo Management Section */}
                    {(transaction.type === 'IN' || transaction.type === 'SHIPMENT') && (
                        <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Photo Proof (max 5)</label>
                            <div className="flex gap-4 overflow-x-auto pb-2">
                                {photos.map((photo, index) => (
                                    <div key={index} className="relative w-24 h-24 flex-shrink-0">
                                        <img src={photo} alt="proof" className="w-full h-full object-cover rounded-md border border-gray-300 dark:border-gray-600" />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(index)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {photos.length < 5 && (
                                     <label className="flex-shrink-0 w-24 h-24 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <span className="text-xs text-gray-500 mt-1">Add Photo</span>
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                                     </label>
                                )}
                            </div>
                        </div>
                    )}

                    {lotStats && (
                        <div className="mt-2 text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between mb-1"><span className="font-semibold text-gray-700 dark:text-gray-300">Lot Capacity Usage:</span><span className={`font-mono ${lotStats.remaining < 0 ? "text-red-600 font-bold" : "text-gray-600 dark:text-gray-300"}`}>{lotStats.produced} / {lotStats.max}</span></div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-600"><div className={`h-1.5 rounded-full ${lotStats.remaining < 0 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (lotStats.produced / lotStats.max) * 100)}%` }}></div></div>
                            {lotStats.remaining < 0 && <p className="text-red-500 mt-1 font-semibold">Warning: Exceeds lot capacity.</p>}
                        </div>
                    )}

                    {allowMaterialEditing && renderMaterialTraceabilityForm()}
                    {(transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && inventory && renderDetailedProductionTable()}
                    {renderLotAllocationTable()}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700">Save Changes</button>
                    </div>
                </form>
            </div>
             <style>{`
                .input-base { display: block; width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; color: #111827; }
                .dark .input-base { background-color: #374151; border-color: #4B5563; color: #FFFFFF; }
                .input-base:focus { outline: 2px solid transparent; outline-offset: 2px; border-color: #B11E31; }
                .input-sm-base { display: block; width: 100%; padding: 0.25rem 0.5rem; font-size: 0.875rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; color: #111827; }
                .dark .input-sm-base { background-color: #374151; border-color: #4B5563; color: #FFFFFF; }
            `}</style>
        </div>
    );
};

export default EditTransactionModal;
