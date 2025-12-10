
import React from 'react';
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

const calculateMaxPallets = (product: typeof FINISHED_PRODUCTS[0], inventory: InventoryState, settings: DashboardProps['settings']): number => {
    const rule = settings.productFormulas[product.id];
    if (!rule) return 0;
    
    const masksPerPallet = rule.masksPerBox * rule.boxesPerCarton * rule.cartonsPerPallet;

    const requirementsPerPallet: Partial<Record<InventoryItemId, number>> = {};
    
    // Raw Materials
    Object.values(rule.rawMaterials).forEach(unknownItemId => {
        const itemId = unknownItemId as InventoryItemId;
        if (settings.bypassedItems[itemId]) return;
        const rejection = 1 + (settings.rejectionCoefficients[itemId] || 0) / 100;
        let requiredQty = 0;
        
        const itemInfo = ITEMS_MAP.get(itemId);
        if (itemInfo?.unit === 'rolls') {
             const masksPerRoll = getMasksPerRoll(itemId, settings);
             requiredQty = (masksPerPallet / masksPerRoll) * rejection;
        }
        requirementsPerPallet[itemId] = requiredQty;
    });

    // Packaging Materials
    if (!settings.bypassedItems[rule.packaging.box]) {
        requirementsPerPallet[rule.packaging.box] = rule.boxesPerCarton * rule.cartonsPerPallet;
    }
    if (!settings.bypassedItems[rule.packaging.carton]) {
        requirementsPerPallet[rule.packaging.carton] = rule.cartonsPerPallet;
    }

    if (Object.keys(requirementsPerPallet).length === 0) return Infinity; // All items bypassed

    const possiblePalletsPerItem = Object.entries(requirementsPerPallet).map(([itemId, requiredQty]) => {
        const stock = inventory[itemId as InventoryItemId] || 0;
        return requiredQty > 0 ? Math.floor(stock / requiredQty) : Infinity;
    });
    
    return Math.max(0, Math.min(...possiblePalletsPerItem));
};

const Dashboard: React.FC<DashboardProps> = ({ inventory, productInventory, setView, settings, onNavigate }) => {
    // Logic Update: Removed check for settings.bypassedItems so alerts show for exempt items
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
                            const isExempt = settings.bypassedItems[item.id];
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
                                            {isExempt && <span className="ml-2 text-[10px] bg-purple-100 text-purple-800 px-1 rounded dark:bg-purple-900 dark:text-purple-300">Exempt</span>}
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
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Max Pallets Producible</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {FINISHED_PRODUCTS.map(product => {
                            const maxPallets = calculateMaxPallets(product, inventory, settings);
                            return (
                            <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    <ProductBadge name={product.name} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{product.customer}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300 font-semibold">{maxPallets.toLocaleString()}</td>
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