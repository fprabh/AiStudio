
import React, { useMemo } from 'react';
import { Transaction, InventoryItemId, OnNavigate } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { SmartLink, LotNumberDisplay } from './VisualHelpers';

interface StockUsageModalProps {
    stockId: string;
    itemId: InventoryItemId;
    itemName: string;
    transactions: Transaction[];
    onClose: () => void;
    onNavigate: OnNavigate;
}

const StockUsageModal: React.FC<StockUsageModalProps> = ({ stockId, itemId, itemName, transactions, onClose, onNavigate }) => {
    const { productionUsage, shipmentUsage } = useMemo(() => {
        const prod: any[] = [];
        const relatedLots = new Set<string>();

        // 1. Find Production Usage (where materialLinkage matches stockId)
        transactions.forEach(tx => {
            if ((tx.type === 'PRODUCTION' || tx.type === 'OUT') && tx.materialLinkage) {
                // Check if this specific item was linked with the specific stockId
                const linkage = tx.materialLinkage[itemId];
                
                // Handle both single string (legacy) and array of strings
                const isLinked = Array.isArray(linkage) ? linkage.includes(stockId) : linkage === stockId;
                
                if (isLinked) {
                    const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                    prod.push({
                        id: tx.id,
                        date: tx.date,
                        productName: product?.name || 'Unknown',
                        lotNumber: tx.orderNumber,
                        quantity: tx.cartonsShipped
                    });
                    if (tx.orderNumber) relatedLots.add(tx.orderNumber);
                }
            }
        });

        // 2. Find Downstream Shipments via Lot Numbers found in Step 1
        const ship: any[] = [];
        transactions.forEach(tx => {
            if (tx.type === 'SHIPMENT' && tx.lotAllocations) {
                Object.entries(tx.lotAllocations).forEach(([lot, qty]) => {
                    if (relatedLots.has(lot)) {
                         const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
                         ship.push({
                             id: tx.id,
                             date: tx.date,
                             customer: product?.customer || 'Unknown',
                             orderNumber: tx.orderNumber,
                             lotNumber: lot,
                             quantity: qty,
                             productName: product?.name
                         });
                    }
                });
            }
        });

        // Sort by date newest first
        prod.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        ship.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return { productionUsage: prod, shipmentUsage: ship };
    }, [stockId, itemId, transactions]);

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Stock Usage Traceability</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Tracing usage for <span className="font-semibold text-brand-dark dark:text-gray-200">{itemName}</span> (Stock ID: <span className="font-mono">{stockId}</span>)
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                        <span className="sr-only">Close</span>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-8 flex-1">
                    {/* Production Usage Section */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center">
                            <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-bold px-2 py-0.5 rounded mr-2">STEP 1</span>
                            Used in Production
                        </h4>
                        {productionUsage.length > 0 ? (
                            <div className="shadow overflow-hidden border-b border-gray-200 dark:border-gray-700 sm:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Product</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Lot Number</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Produced Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {productionUsage.map((item, idx) => (
                                            <tr key={idx} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Date(item.date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.productName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                                                    <SmartLink 
                                                        type="lot" 
                                                        value={item.lotNumber} 
                                                        label={<LotNumberDisplay value={item.lotNumber} />} 
                                                        onNavigate={onNavigate} 
                                                    />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">{item.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">This stock has not been recorded in any production lots yet.</p>
                        )}
                    </div>

                    {/* Shipment Usage Section */}
                    <div>
                         <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center">
                            <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-bold px-2 py-0.5 rounded mr-2">STEP 2</span>
                            Shipped to Customers
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Derived from lots produced using this material.</p>
                        
                        {shipmentUsage.length > 0 ? (
                            <div className="shadow overflow-hidden border-b border-gray-200 dark:border-gray-700 sm:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Product</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Order Ref / Lot</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Shipped Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {shipmentUsage.map((item, idx) => (
                                            <tr key={idx} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Date(item.date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.customer}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.productName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <div className="font-medium text-gray-900 dark:text-white mb-0.5">
                                                        {item.orderNumber ? (
                                                            <SmartLink 
                                                                type="shipment" 
                                                                value={item.orderNumber} 
                                                                label={item.orderNumber} 
                                                                onNavigate={onNavigate} 
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400 italic text-xs">No PO</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                        Lot: <LotNumberDisplay value={item.lotNumber} />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">{item.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No shipments found associated with lots using this stock.</p>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockUsageModal;