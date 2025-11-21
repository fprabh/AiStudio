
import React, { useMemo, useState } from 'react';
import { Transaction, ProductId, AppSettings, Customer, InventoryItemId } from '../types';
import { FINISHED_PRODUCTS, getProductLotConfig, INVENTORY_ITEMS } from '../constants';

interface LotHistoryProps {
  transactions: Transaction[];
  settings: AppSettings;
}

interface ShipmentInfo {
    id: string;
    date: string;
    customer: string;
    quantity: number;
    orderNumber?: string;
}

interface LotAggregated {
    lotNumber: string;
    productId: string;
    productName: string;
    customer: Customer | 'Unknown';
    startDate: string; // First Production Date
    endDate: string;   // Last Production Date
    producedQty: number;
    shippedQty: number;
    remainingQty: number; // In Stock
    maxCapacity: number;
    remainingToProduce: number;
    status: 'Active' | 'Depleted' | 'Unknown';
    shipments: ShipmentInfo[];
    materials: Record<InventoryItemId, Set<string>>; // Linked Raw Materials
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const LotHistory: React.FC<LotHistoryProps> = ({ transactions, settings }) => {
    const [expandedLot, setExpandedLot] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const lotData = useMemo(() => {
        const lots: Record<string, LotAggregated> = {};

        // 1. Process Production Logs
        transactions.forEach(tx => {
            if ((tx.type === 'PRODUCTION' || tx.type === 'OUT') && tx.orderNumber) {
                if (!lots[tx.orderNumber]) {
                    const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                    let maxCapacity = 0;
                    if (tx.productId) {
                         try {
                             maxCapacity = getProductLotConfig(tx.productId as ProductId, settings).maxCartons;
                         } catch(e) { maxCapacity = 0; }
                    }

                    lots[tx.orderNumber] = {
                        lotNumber: tx.orderNumber,
                        productId: tx.productId || '',
                        productName: product?.name || 'Unknown Product',
                        customer: product?.customer || 'Unknown',
                        startDate: tx.date,
                        endDate: tx.date,
                        producedQty: 0,
                        shippedQty: 0,
                        remainingQty: 0,
                        maxCapacity,
                        remainingToProduce: 0,
                        status: 'Active',
                        shipments: [],
                        materials: {} as Record<InventoryItemId, Set<string>>
                    };
                }
                lots[tx.orderNumber].producedQty += (tx.cartonsShipped || 0);
                
                // Date logic
                if (new Date(tx.date) < new Date(lots[tx.orderNumber].startDate)) {
                    lots[tx.orderNumber].startDate = tx.date;
                }
                if (new Date(tx.date) > new Date(lots[tx.orderNumber].endDate)) {
                    lots[tx.orderNumber].endDate = tx.date;
                }

                // Material Linkage Aggregation
                if (tx.materialLinkage) {
                    Object.entries(tx.materialLinkage).forEach(([itemId, stockId]) => {
                        if (!lots[tx.orderNumber!].materials[itemId as InventoryItemId]) {
                            lots[tx.orderNumber!].materials[itemId as InventoryItemId] = new Set();
                        }
                        lots[tx.orderNumber!].materials[itemId as InventoryItemId].add(stockId);
                    });
                }
            }
        });

        // 2. Process Shipment Logs
        transactions.forEach(tx => {
            if (tx.type === 'SHIPMENT' && tx.lotAllocations) {
                Object.entries(tx.lotAllocations).forEach(([lotId, qty]) => {
                     if (!lots[lotId]) {
                        // Found a shipment for a lot we don't have a production record for (e.g., legacy data)
                        const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                        let maxCapacity = 0;
                        if (tx.productId) {
                             try {
                                 maxCapacity = getProductLotConfig(tx.productId as ProductId, settings).maxCartons;
                             } catch(e) { maxCapacity = 0; }
                        }

                        lots[lotId] = {
                            lotNumber: lotId,
                            productId: tx.productId || '',
                            productName: product?.name || 'Unknown',
                            customer: product?.customer || 'Unknown',
                            startDate: 'N/A', 
                            endDate: 'N/A',
                            producedQty: 0, 
                            shippedQty: 0,
                            remainingQty: 0,
                            maxCapacity,
                            remainingToProduce: 0,
                            status: 'Unknown',
                            shipments: [],
                            materials: {} as Record<InventoryItemId, Set<string>>
                        };
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

        // 3. Calculate Remaining & Status
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
            
            // Sort shipments by date (newest first)
            lot.shipments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            return lot;
        }).sort((a, b) => {
            // Sort lots by date produced desc
            if (a.startDate === 'N/A') return 1;
            if (b.startDate === 'N/A') return -1;
            return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        });

    }, [transactions, settings]);

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


    const filteredLots = lotData.filter(l => 
        l.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.customer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleExpand = (lotId: string) => {
        setExpandedLot(prev => prev === lotId ? null : lotId);
    };

    const formatDateRange = (start: string, end: string) => {
        if (start === 'N/A') return 'N/A';
        const s = new Date(start).toLocaleDateString();
        const e = new Date(end).toLocaleDateString();
        return s === e ? s : `${s} - ${e}`;
    };

    return (
        <div className="space-y-8">
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
                            <div key={key} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-brand-red">
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
                                        <div className="text-lg font-mono font-semibold text-brand-dark dark:text-white mb-1">
                                            {lot.lotNumber}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
                                            Since: {new Date(lot.startDate).toLocaleDateString()}
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
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lot Number</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Range</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Produced / Max</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shipped</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">In Stock</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                        </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredLots.length > 0 ? (
                            filteredLots.map((lot) => (
                                <React.Fragment key={lot.lotNumber}>
                                    <tr 
                                        onClick={() => toggleExpand(lot.lotNumber)}
                                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${expandedLot === lot.lotNumber ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-brand-red dark:text-red-400">
                                            {lot.lotNumber}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-300">
                                            {formatDateRange(lot.startDate, lot.endDate)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                            <div className="font-medium">{lot.productName}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{lot.customer}</div>
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
                                        <td className="px-6 py-4 text-center text-gray-400">
                                            <svg className={`w-5 h-5 transform transition-transform ${expandedLot === lot.lotNumber ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
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
                                                         
                                                         {Object.keys(lot.materials).length > 0 && (
                                                             <div>
                                                                 <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Raw Material Traceability</h4>
                                                                 <div className="bg-white dark:bg-gray-700/30 rounded border border-gray-100 dark:border-gray-600 p-2">
                                                                     <ul className="space-y-1">
                                                                         {Object.entries(lot.materials).map(([itemId, stockIds]) => {
                                                                             const itemName = ITEMS_MAP.get(itemId as InventoryItemId)?.name || itemId;
                                                                             return (
                                                                                 <li key={itemId} className="text-xs flex flex-wrap gap-2 items-center">
                                                                                     <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">{itemName}:</span>
                                                                                     <div className="flex flex-wrap gap-1">
                                                                                        {Array.from(stockIds).map(id => (
                                                                                            <span key={id} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200 rounded font-mono border border-gray-200 dark:border-gray-500">
                                                                                                {id}
                                                                                            </span>
                                                                                        ))}
                                                                                     </div>
                                                                                 </li>
                                                                             );
                                                                         })}
                                                                     </ul>
                                                                 </div>
                                                             </div>
                                                         )}
                                                     </div>

                                                     <div>
                                                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Shipment Allocation Details</h4>
                                                        {lot.shipments.length > 0 ? (
                                                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
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
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500 dark:text-gray-300 font-mono">{shipment.orderNumber || '-'}</td>
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
                            ))
                        ) : (
                            <tr>
                                <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                                    No lots found matching your search.
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

export default LotHistory;