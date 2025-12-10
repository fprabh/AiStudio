
import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, ProductId, AppSettings, Customer, InventoryItemId, InventoryState, LotMetadata, OnNavigate } from '../types';
import { FINISHED_PRODUCTS, getProductLotConfig, INVENTORY_ITEMS } from '../constants';
import EditLotModal from './EditLotModal';
import { useInventory } from '../hooks/useInventory';
import { LotNumberDisplay, ProductBadge, SmartLink } from './VisualHelpers';

interface LotHistoryProps {
  transactions: Transaction[];
  settings: AppSettings;
  lotMetadata: Record<string, LotMetadata>;
  updateLotMetadata: (lotNumber: string, meta: LotMetadata) => void;
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  inventory: InventoryState;
  initialSearchTerm?: string;
  onNavigate: OnNavigate;
}

export interface LotAggregated {
    lotNumber: string;
    productIds: string[]; 
    productNames: string[];
    customer: Customer | 'Unknown';
    startDate: string; // From Metadata
    endDate: string;   // From Metadata
    producedQty: number;
    shippedQty: number;
    remainingQty: number; // In Stock
    maxCapacity: number;
    remainingToProduce: number;
    status: 'Active' | 'Depleted' | 'Unknown';
    shipments: ShipmentInfo[];
    materials: Record<InventoryItemId, Set<string>>; // Linked Raw Materials
    missingMaterials: boolean;
}

interface ShipmentInfo {
    id: string;
    date: string;
    customer: string;
    quantity: number;
    orderNumber?: string;
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const LotHistory: React.FC<LotHistoryProps> = ({ transactions, settings, lotMetadata, updateLotMetadata, updateTransaction, deleteTransaction, inventory, initialSearchTerm, onNavigate }) => {
    const [expandedLot, setExpandedLot] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
    const [editingLot, setEditingLot] = useState<LotAggregated | null>(null);

    // Sync search term if changed from props (Navigation)
    useEffect(() => {
        if (initialSearchTerm) {
            setSearchTerm(initialSearchTerm);
            setExpandedLot(initialSearchTerm); // Auto-expand if navigating to specific lot
        }
    }, [initialSearchTerm]);

    const lotData = useMemo(() => {
        const lots: Record<string, LotAggregated> = {};

        // 1. Process Production Logs
        transactions.forEach(tx => {
            if ((tx.type === 'PRODUCTION' || tx.type === 'OUT') && tx.orderNumber) {
                const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                const lotMeta = lotMetadata[tx.orderNumber] || {};
                
                if (!lots[tx.orderNumber]) {
                    let maxCapacity = 0;
                    if (tx.productId) {
                         try {
                             maxCapacity = getProductLotConfig(tx.productId as ProductId, settings).maxCartons;
                         } catch(e) { maxCapacity = 0; }
                    }

                    lots[tx.orderNumber] = {
                        lotNumber: tx.orderNumber,
                        productIds: [],
                        productNames: [],
                        customer: product?.customer || 'Unknown',
                        startDate: lotMeta.startDate || '',
                        endDate: lotMeta.endDate || '',
                        producedQty: 0,
                        shippedQty: 0,
                        remainingQty: 0,
                        maxCapacity,
                        remainingToProduce: 0,
                        status: 'Active',
                        shipments: [],
                        materials: {} as Record<InventoryItemId, Set<string>>,
                        missingMaterials: false
                    };
                }

                // Add Product Info if not exists
                if (tx.productId && !lots[tx.orderNumber].productIds.includes(tx.productId)) {
                    lots[tx.orderNumber].productIds.push(tx.productId);
                }
                if (product && !lots[tx.orderNumber].productNames.includes(product.name)) {
                    lots[tx.orderNumber].productNames.push(product.name);
                }

                lots[tx.orderNumber].producedQty += (tx.cartonsShipped || 0);
                
                // Material Linkage Aggregation (Updated for Arrays)
                if (tx.materialLinkage) {
                    Object.entries(tx.materialLinkage).forEach(([itemId, stockIds]) => {
                        const ids = Array.isArray(stockIds) ? stockIds : [stockIds as string];
                        if (!lots[tx.orderNumber!].materials[itemId as InventoryItemId]) {
                            lots[tx.orderNumber!].materials[itemId as InventoryItemId] = new Set();
                        }
                        ids.forEach(sid => {
                            lots[tx.orderNumber!].materials[itemId as InventoryItemId].add(sid);
                        });
                    });
                }
            }
        });

        // 2. Process Shipment Logs
        transactions.forEach(tx => {
            if (tx.type === 'SHIPMENT' && tx.lotAllocations) {
                (Object.entries(tx.lotAllocations) as [string, number][]).forEach(([lotId, qty]) => {
                     if (!lots[lotId]) {
                        // Found a shipment for a lot we don't have a production record for (e.g., legacy data)
                        const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                        const lotMeta = lotMetadata[lotId] || {};
                        let maxCapacity = 0;
                        if (tx.productId) {
                             try {
                                 maxCapacity = getProductLotConfig(tx.productId as ProductId, settings).maxCartons;
                             } catch(e) { maxCapacity = 0; }
                        }

                        lots[lotId] = {
                            lotNumber: lotId,
                            productIds: [],
                            productNames: [],
                            customer: product?.customer || 'Unknown',
                            startDate: lotMeta.startDate || '', 
                            endDate: lotMeta.endDate || '',
                            producedQty: 0, 
                            shippedQty: 0,
                            remainingQty: 0,
                            maxCapacity,
                            remainingToProduce: 0,
                            status: 'Unknown',
                            shipments: [],
                            materials: {} as Record<InventoryItemId, Set<string>>,
                            missingMaterials: false
                        };
                     }

                     // Add Product Info from shipment if missing (legacy case)
                     if (tx.productId && !lots[lotId].productIds.includes(tx.productId)) {
                        lots[lotId].productIds.push(tx.productId);
                        const pName = FINISHED_PRODUCTS.find(p => p.id === tx.productId)?.name;
                        if (pName && !lots[lotId].productNames.includes(pName)) {
                            lots[lotId].productNames.push(pName);
                        }
                     }

                     lots[lotId].shippedQty += qty;
                     lots[lotId].shipments.push({
                         id: tx.id,
                         date: tx.date,
                         customer: FINISHED_PRODUCTS.find(p => p.id === tx.productId)?.customer || 'Unknown',
                         quantity: qty,
                         orderNumber: tx.orderNumber
                     });
                });
            }
        });

        // 3. Calculate Remaining & Status & Missing Materials
        return Object.values(lots).map(lot => {
            lot.remainingQty = lot.producedQty - lot.shippedQty;
            lot.remainingToProduce = Math.max(0, lot.maxCapacity - lot.producedQty);
            
            if (lot.producedQty >= lot.maxCapacity && lot.remainingQty <= 0) {
                lot.status = 'Depleted';
            } else if (lot.producedQty === 0 && lot.shippedQty > 0) {
                lot.status = 'Unknown'; // Orphaned shipment without production record
            } else {
                lot.status = 'Active';
            }
            
            // Check Missing Materials for ALL products in this lot
            // If any product requires materials but none are linked, mark as missing.
            lot.missingMaterials = false;
            if (lot.producedQty > 0) {
                for (const pid of lot.productIds) {
                     if (settings.productFormulas[pid as ProductId]) {
                        const formula = settings.productFormulas[pid as ProductId];
                        // Updated: Include Capacity Exempt items
                        const required = (Object.values(formula.rawMaterials) as InventoryItemId[]);
                        const hasMissing = required.some(reqId => !lot.materials[reqId]);
                        if (hasMissing) {
                            lot.missingMaterials = true;
                            break;
                        }
                     }
                }
            }

            // Sort shipments by date (newest first)
            lot.shipments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            return lot;
        }).sort((a, b) => {
            // Sort lots by date produced desc, prioritize lots with dates
            if (!a.startDate && !b.startDate) {
                // Fallback to numeric sequence sort if no date
                 const seqA = parseInt(a.lotNumber.split('-')[1]?.trim() || '0');
                 const seqB = parseInt(b.lotNumber.split('-')[1]?.trim() || '0');
                 return seqB - seqA;
            }
            if (!a.startDate) return 1;
            if (!b.startDate) return -1;
            return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        });

    }, [transactions, settings, lotMetadata]);

    const activeLotsOverview = useMemo(() => {
        // Define distinct overview cards
        const keys = [
            { level: 'LV1', customer: 'Alliance' },
            { level: 'LV2', customer: 'Alliance' },
            { level: 'LV3', customer: 'Alliance' },
            { level: 'LV3', customer: 'PHSA' },
            { level: 'LV3', customer: 'PADM' }
        ];

        const active: Record<string, LotAggregated | null> = {};
        
        keys.forEach(({ level, customer }) => {
            // Find lots matching this category and customer
            const categoryLots = lotData.filter(l => 
                l.lotNumber.startsWith(level) && l.customer === customer
            );
            
            // Sort by Sequence Number Descending
            categoryLots.sort((a, b) => {
                const seqA = parseInt(a.lotNumber.split('-')[1]?.trim() || '0');
                const seqB = parseInt(b.lotNumber.split('-')[1]?.trim() || '0');
                return seqB - seqA;
            });

            // Find the latest one that still has remaining capacity to produce
            const workingOn = categoryLots.find(l => l.remainingToProduce > 0);
            
            active[`${level}-${customer}`] = workingOn || null;
        });

        return active;
    }, [lotData]);


    // Filter Logic
    const filteredLots = lotData.filter(l => 
        l.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.productNames.some(name => name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        l.customer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Grouping Logic: Group filtered lots by Customer and Level
    const lotsByGroup = useMemo(() => {
        const groups: Record<string, LotAggregated[]> = {};
        
        filteredLots.forEach(lot => {
            let groupName = lot.customer || 'Unknown';
            
            // Sub-divide Alliance based on Lot Number Prefix
            if (groupName === 'Alliance') {
                if (lot.lotNumber.startsWith('LV1')) groupName = 'Alliance Level 1';
                else if (lot.lotNumber.startsWith('LV2')) groupName = 'Alliance Level 2';
                else if (lot.lotNumber.startsWith('LV3')) groupName = 'Alliance Level 3';
            }
            
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(lot);
        });

        return groups;
    }, [filteredLots]);

    // Sorting the Groups based on Priority
    const sortedGroupKeys = useMemo(() => {
        const keys = Object.keys(lotsByGroup);
        const priority = ['Alliance Level 1', 'Alliance Level 2', 'Alliance Level 3', 'PHSA', 'PADM'];
        
        return keys.sort((a, b) => {
             const idxA = priority.indexOf(a);
             const idxB = priority.indexOf(b);
             if (idxA !== -1 && idxB !== -1) return idxA - idxB;
             if (idxA !== -1) return -1;
             if (idxB !== -1) return 1;
             return a.localeCompare(b);
        });
    }, [lotsByGroup]);

    const toggleExpand = (lotId: string) => {
        setExpandedLot(prev => prev === lotId ? null : lotId);
    };

    const handleSaveChanges = (updated: Transaction[], deletedIds: string[], lotMeta: LotMetadata) => {
        updated.forEach(tx => updateTransaction(tx));
        deletedIds.forEach(id => deleteTransaction(id));
        
        // Update Metadata
        if (editingLot) {
            updateLotMetadata(editingLot.lotNumber, lotMeta);
        }
        
        setEditingLot(null);
    };

    const formatDateRange = (start: string, end: string) => {
        if (!start) return <span className="text-gray-400 italic">Set Date</span>;
        const s = new Date(start).toLocaleDateString();
        if (!end) return <span>{s} - <span className="text-gray-400 italic">...</span></span>;
        const e = new Date(end).toLocaleDateString();
        return s === e ? s : `${s} - ${e}`;
    };

    return (
        <div className="space-y-8">
            {editingLot && (
                <EditLotModal
                    lot={editingLot}
                    allTransactions={transactions}
                    settings={settings}
                    inventory={inventory}
                    onClose={() => setEditingLot(null)}
                    onSave={handleSaveChanges}
                />
            )}
             <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Lot Traceability</h2>
                
                {/* Active Lots Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    {[
                        { key: 'LV1-Alliance', label: 'LV1 Alliance' },
                        { key: 'LV2-Alliance', label: 'LV2 Alliance' },
                        { key: 'LV3-Alliance', label: 'LV3 Alliance' },
                        { key: 'LV3-PHSA', label: 'LV3 PHSA' },
                        { key: 'LV3-PADM', label: 'LV3 PADM' }
                    ].map(({ key, label }) => {
                        const lot = activeLotsOverview[key];
                        return (
                            <div key={key} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-brand-red border border-gray-200 dark:border-gray-700">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">{label}</h3>
                                    {lot && (
                                        <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-1.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300">
                                            Active
                                        </span>
                                    )}
                                </div>
                                {lot ? (
                                    <div className="mt-1">
                                        <div className="text-lg font-mono font-semibold text-brand-dark dark:text-white mb-1 flex items-center">
                                            <SmartLink 
                                                type="lot" 
                                                value={lot.lotNumber} 
                                                label={<LotNumberDisplay value={lot.lotNumber} />} 
                                                onNavigate={onNavigate} 
                                            />
                                            {lot.missingMaterials && (
                                                <span className="ml-2 text-amber-500" title="Missing Raw Material Linkage">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                </span>
                                             )}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
                                            Since: {lot.startDate ? new Date(lot.startDate).toLocaleDateString() : 'N/A'}
                                        </div>
                                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 mb-1">
                                                <div className="bg-brand-red h-1.5 rounded-full" style={{ width: `${Math.min(100, (lot.producedQty / lot.maxCapacity) * 100)}%` }}></div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                                                <span>{lot.producedQty} made</span>
                                                <span>{lot.remainingToProduce} left</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 italic">
                                        No active lot
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>


             <div className="flex justify-between items-center flex-wrap gap-4">
                 <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">All Lots History</h3>
                <div className="w-full sm:w-auto">
                    <label htmlFor="search" className="sr-only">Search</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            id="search"
                            placeholder="Search Lot, Product, or Customer..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                         {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Loop through Sorted Groups and render tables */}
            {sortedGroupKeys.map((groupName) => {
                const customerLots = lotsByGroup[groupName];
                const impliesLevel = groupName.includes('Level'); // Check if group title implies level

                return (
                <div key={groupName} className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-8">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{groupName}</h3>
                        <span className="text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded-full">
                            {customerLots.length} Lots
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lot Number</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Range</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Products</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Produced / Max</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shipped</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">In Stock</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                            </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {customerLots.map((lot, idx) => (
                                <React.Fragment key={lot.lotNumber}>
                                    <tr 
                                        className={`transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/50'} ${expandedLot === lot.lotNumber ? 'bg-gray-100 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex items-center">
                                            <LotNumberDisplay value={lot.lotNumber} />
                                            {lot.missingMaterials && (
                                                <span className="ml-2 text-amber-500" title="Missing Raw Material Linkage">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                </span>
                                             )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-300">
                                            {formatDateRange(lot.startDate, lot.endDate)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                            <div className="flex flex-col space-y-1">
                                                {lot.productNames.map(name => (
                                                    <ProductBadge key={name} name={name} hideCustomer={true} hideLevel={impliesLevel} />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-900 dark:text-white">
                                            {lot.producedQty} / <span className="text-gray-400">{lot.maxCapacity}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-blue-600 dark:text-blue-400">
                                            {lot.shippedQty}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-bold ${lot.remainingQty > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {lot.remainingQty}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                             <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                lot.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                                lot.status === 'Depleted' ? 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300' :
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                             }`}>
                                                {lot.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex space-x-2 justify-center">
                                                <button onClick={() => setEditingLot(lot)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" title="Manage Lot">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                                </button>
                                                <button onClick={() => toggleExpand(lot.lotNumber)} className="text-gray-400 hover:text-gray-600" title="View Details">
                                                    <svg className={`w-5 h-5 transform transition-transform ${expandedLot === lot.lotNumber ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedLot === lot.lotNumber && (
                                        <tr className="bg-gray-50 dark:bg-gray-800">
                                            <td colSpan={8} className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                                                     <div className="space-y-4">
                                                         <div>
                                                             <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Production Progress</h4>
                                                             <div className="flex items-center space-x-2">
                                                                 <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
                                                                     <div 
                                                                        className="h-full bg-green-500" 
                                                                        style={{ width: lot.maxCapacity > 0 ? `${Math.min(100, (lot.producedQty / lot.maxCapacity) * 100)}%` : '0%' }}
                                                                     ></div>
                                                                 </div>
                                                                 <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                                                    {lot.producedQty} / {lot.maxCapacity > 0 ? lot.maxCapacity : '?'}
                                                                 </span>
                                                             </div>
                                                             <div className="text-xs text-gray-500 mt-1">
                                                                 {lot.remainingToProduce} cartons remaining to produce for this lot.
                                                             </div>
                                                         </div>
                                                         
                                                         {(Object.keys(lot.materials) as string[]).length > 0 ? (
                                                             <div>
                                                                 <div className="flex items-center mb-2">
                                                                     <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Raw Material Traceability</h4>
                                                                     {lot.missingMaterials && <span className="ml-2 text-[10px] text-amber-600 font-bold bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 rounded">INCOMPLETE</span>}
                                                                 </div>
                                                                 <div className="bg-white dark:bg-gray-700/30 rounded border border-gray-100 dark:border-gray-600 p-2">
                                                                     <ul className="space-y-1">
                                                                         {(Object.entries(lot.materials) as [InventoryItemId, Set<string>][]).map(([itemId, stockIds]) => {
                                                                             const itemName = ITEMS_MAP.get(itemId)?.name || itemId;
                                                                             return (
                                                                                 <li key={itemId} className="text-xs flex flex-wrap gap-2 items-center">
                                                                                     <SmartLink 
                                                                                        type="inventory" 
                                                                                        value={itemId} 
                                                                                        label={itemName} 
                                                                                        onNavigate={onNavigate}
                                                                                        className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px] hover:text-blue-600 dark:hover:text-blue-400" 
                                                                                     />:
                                                                                     <div className="flex flex-wrap gap-1">
                                                                                        {(Array.from(stockIds) as string[]).map(id => (
                                                                                            <span key={id} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200 rounded font-mono border border-gray-200 dark:border-gray-500">
                                                                                                <SmartLink 
                                                                                                    type="stock" 
                                                                                                    value={id} 
                                                                                                    label={id} 
                                                                                                    onNavigate={onNavigate} 
                                                                                                    className="text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
                                                                                                />
                                                                                            </span>
                                                                                        ))}
                                                                                     </div>
                                                                                 </li>
                                                                             );
                                                                         })}
                                                                     </ul>
                                                                 </div>
                                                             </div>
                                                         ) : (
                                                             <div className="bg-amber-50 dark:bg-amber-900/10 p-2 rounded border border-amber-100 dark:border-amber-900/30">
                                                                 <p className="text-xs text-amber-700 dark:text-amber-500 flex items-center">
                                                                     <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                     </svg>
                                                                     No raw material linkages recorded.
                                                                 </p>
                                                             </div>
                                                         )}
                                                     </div>

                                                     <div>
                                                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Shipment Allocation Details</h4>
                                                        {lot.shipments.length > 0 ? (
                                                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg border border-gray-200 dark:border-gray-600">
                                                                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                                                                    <thead className="bg-gray-100 dark:bg-gray-700">
                                                                        <tr>
                                                                            <th className="py-2 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ship Date</th>
                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Customer</th>
                                                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Order Ref</th>
                                                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Allocated Qty</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                                                                        {lot.shipments.map((shipment) => (
                                                                            <tr key={`${lot.lotNumber}-${shipment.id}`}>
                                                                                <td className="whitespace-nowrap py-2 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-300">{new Date(shipment.date).toLocaleDateString()}</td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">{shipment.customer}</td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500 dark:text-gray-300 font-mono">
                                                                                     {shipment.orderNumber ? (
                                                                                        <SmartLink 
                                                                                            type="shipment" 
                                                                                            value={shipment.orderNumber} 
                                                                                            label={shipment.orderNumber} 
                                                                                            onNavigate={onNavigate} 
                                                                                        />
                                                                                     ) : '-'}
                                                                                </td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm text-right font-mono text-gray-900 dark:text-white">{shipment.quantity}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No shipments recorded for this lot yet.</p>
                                                        )}
                                                     </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )})}
            
            {Object.keys(lotsByGroup).length === 0 && (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
                    <p className="text-gray-500 dark:text-gray-400">No lots found matching your search.</p>
                </div>
            )}
        </div>
    );
};

export default LotHistory;