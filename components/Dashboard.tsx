
import React, { useState } from 'react';
import { InventoryState, View, InventoryItemId, ProductId, ProductState, AppSettings, OnNavigate } from '../types';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import { ProductBadge, SmartLink } from './VisualHelpers';

type DashboardProps = {
  inventory: InventoryState;
  productInventory?: ProductState; // Optional for backward compat
  setView: (view: View) => void;
  settings: ReturnType<typeof useInventory>['settings'];
  onNavigate: OnNavigate;
};

interface Constraint {
    itemId: InventoryItemId;
    name: string;
    stock: number;
    unit: string;
    maxPallets: number;
}

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const getMasksPerRoll = (itemId: InventoryItemId, settings: AppSettings): number => {
    if (itemId === 'meltblownFabric') return settings.materialUsage.masksPerRollMeltblown;
    if (itemId === 'backLayerFabric') return settings.materialUsage.masksPerRollBackLayer;
    if (itemId.startsWith('outerLayerL1')) return settings.materialUsage.masksPerRollOuterL1;
    if (itemId.startsWith('outerLayerL2')) return settings.materialUsage.masksPerRollOuterL2;
    if (itemId.startsWith('outerLayerL3')) return settings.materialUsage.masksPerRollOuterL3;
    if (itemId === 'nosewire') return settings.materialUsage.masksPerRollNosewire;
    if (itemId === 'elastic') return settings.materialUsage.masksPerRollElastic;
    return 1; 
};

const calculateConstraints = (product: typeof FINISHED_PRODUCTS[0], inventory: InventoryState, settings: AppSettings): Constraint[] => {
    const rule = settings.productFormulas[product.id];
    if (!rule) return [];
    
    const masksPerPallet = rule.masksPerBox * rule.boxesPerCarton * rule.cartonsPerPallet;
    const constraints: Constraint[] = [];

    // Helper to add constraint
    const addConstraint = (itemId: InventoryItemId, requiredQty: number) => {
        const stock = inventory[itemId] || 0;
        const item = ITEMS_MAP.get(itemId);
        // If requiredQty is 0, max is Infinity. Ensure result is non-negative.
        const max = requiredQty > 0 ? Math.max(0, Math.floor(stock / requiredQty)) : Infinity;
        
        constraints.push({
            itemId,
            name: item?.name || itemId,
            stock,
            unit: item?.unit || '',
            maxPallets: max
        });
    };

    // Raw Materials
    Object.values(rule.rawMaterials).forEach(unknownItemId => {
        const itemId = unknownItemId as InventoryItemId;
        // NOTE: Bypass check removed as requested
        const rejection = 1 + (settings.rejectionCoefficients[itemId] || 0) / 100;
        let requiredQty = 0;
        
        const itemInfo = ITEMS_MAP.get(itemId);
        if (itemInfo?.unit === 'rolls') {
             const masksPerRoll = getMasksPerRoll(itemId, settings);
             requiredQty = (masksPerPallet / masksPerRoll) * rejection;

             // FIX: Elastic requires 2 rolls per mask production run
             if (itemId === 'elastic') {
                 requiredQty *= 2;
             }
        }
        addConstraint(itemId, requiredQty);
    });

    // Packaging Materials
    addConstraint(rule.packaging.box, rule.boxesPerCarton * rule.cartonsPerPallet);
    addConstraint(rule.packaging.carton, rule.cartonsPerPallet);

    // Sort by maxPallets ASC to find tightest bottlenecks first
    return constraints.sort((a, b) => {
        if (a.maxPallets !== b.maxPallets) return a.maxPallets - b.maxPallets;
        return a.name.localeCompare(b.name);
    });
};

const Dashboard: React.FC<DashboardProps> = ({ inventory, productInventory, setView, settings, onNavigate }) => {
    // Local state to track which bottleneck index to show for each product
    const [bottleneckIndices, setBottleneckIndices] = useState<Record<string, number>>({});

    const handleConstraintNav = (productId: string, direction: -1 | 1, maxIndex: number) => {
        setBottleneckIndices(prev => {
            const current = prev[productId] || 0;
            const next = Math.max(0, Math.min(maxIndex, current + direction));
            return { ...prev, [productId]: next };
        });
    };

    const lowStockItems = INVENTORY_ITEMS
        .filter(item => {
            const currentStock = inventory[item.id] || 0;
            const lowThreshold = settings.stockThresholds[item.id]?.low;
            return currentStock < lowThreshold;
        });
        
    const sufficientStockItems = INVENTORY_ITEMS
        .filter(item => {
            const currentStock = inventory[item.id] || 0;
            const thresholds = settings.stockThresholds[item.id];
            return currentStock >= thresholds.low && currentStock < thresholds.ideal;
        });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Stock Alerts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
                <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2 border-b border-red-200 dark:border-red-800 pb-1">
                    Low Stock (Raw Materials)
                </h3>
                {lowStockItems.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {lowStockItems.map(item => {
                            const currentStock = inventory[item.id] || 0;
                            const formatStock = (stock: number) => item.unit === 'rolls' ? stock.toFixed(2) : stock.toLocaleString();
                            return (
                                <li key={item.id} className="py-3 flex justify-between items-center">
                                    <div>
                                        <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                            <SmartLink 
                                                type="inventory" 
                                                value={item.id} 
                                                label={item.name} 
                                                onNavigate={onNavigate} 
                                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                            />
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            Low Threshold: {settings.stockThresholds[item.id]?.low} {item.unit}
                                        </p>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                        {formatStock(currentStock)}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">No raw materials are critically low.</p>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2 border-b border-yellow-200 dark:border-yellow-800 pb-1">
                    Sufficient (Below Ideal)
                </h3>
                {sufficientStockItems.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {sufficientStockItems.map(item => {
                            const currentStock = inventory[item.id] || 0;
                            const formatStock = (stock: number) => item.unit === 'rolls' ? stock.toFixed(2) : stock.toLocaleString();
                            return (
                                <li key={item.id} className="py-3 flex justify-between items-center">
                                    <div>
                                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                                            <SmartLink 
                                                type="inventory" 
                                                value={item.id} 
                                                label={item.name} 
                                                onNavigate={onNavigate} 
                                                className="text-yellow-800 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-200"
                                            />
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            Ideal Threshold: {settings.stockThresholds[item.id]?.ideal} {item.unit}
                                        </p>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                        {formatStock(currentStock)}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">All items are at or above ideal levels.</p>
                )}
            </div>
        </div>
      </div>

      {productInventory && (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Finished Goods Inventory</h2>
         <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                     <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Product</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cartons in Stock</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {FINISHED_PRODUCTS.map(product => {
                            const currentStock = productInventory[product.id] || 0;
                            return (
                            <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    <ProductBadge name={product.name} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{product.customer}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono">{currentStock.toLocaleString()}</td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Theoretical Production Capacity</h2>
         <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                     <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Product SKU</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/3">Limiting Factor (Bottleneck)</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Max Pallets</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {FINISHED_PRODUCTS.map(product => {
                            const constraints = calculateConstraints(product, inventory, settings);
                            const currentIndex = bottleneckIndices[product.id] || 0;
                            const activeConstraint = constraints[currentIndex];
                            
                            // Safeguard if constraints is empty (unlikely with valid settings)
                            const maxPallets = activeConstraint ? activeConstraint.maxPallets : 0;
                            
                            const formatStock = (val: number, unit: string) => unit === 'rolls' ? val.toFixed(2) : val.toLocaleString();

                            return (
                            <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    <ProductBadge name={product.name} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{product.customer}</td>
                                
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {activeConstraint ? (
                                        <div className="flex items-center justify-center space-x-2">
                                            <button 
                                                onClick={() => handleConstraintNav(product.id, -1, constraints.length - 1)}
                                                disabled={currentIndex === 0}
                                                className={`p-1 rounded-full ${currentIndex === 0 ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600'}`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                            
                                            <div className="flex flex-col items-center w-48">
                                                <span className={`text-sm font-bold truncate max-w-full ${currentIndex === 0 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                                    <SmartLink 
                                                        type="inventory" 
                                                        value={activeConstraint.itemId} 
                                                        label={activeConstraint.name} 
                                                        onNavigate={onNavigate} 
                                                        className={`hover:underline ${currentIndex === 0 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}
                                                    />
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    Stock: {formatStock(activeConstraint.stock, activeConstraint.unit)} {activeConstraint.unit}
                                                </span>
                                            </div>

                                            <button 
                                                onClick={() => handleConstraintNav(product.id, 1, constraints.length - 1)}
                                                disabled={currentIndex === constraints.length - 1}
                                                className={`p-1 rounded-full ${currentIndex === constraints.length - 1 ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600'}`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 text-sm">No constraints defined</span>
                                    )}
                                    {activeConstraint && currentIndex > 0 && (
                                        <div className="text-[10px] text-gray-400 text-center mt-1">
                                            Ignoring {currentIndex} stricter bottleneck(s)
                                        </div>
                                    )}
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">
                                    <span className="text-lg font-bold text-gray-900 dark:text-white">{maxPallets === Infinity ? '∞' : maxPallets.toLocaleString()}</span>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
