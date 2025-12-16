
import React, { useEffect, useRef } from 'react';
import { InventoryState, Category, InventoryItem, OnNavigate, InventoryItemId } from '../types';
import { INVENTORY_ITEMS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import { CategoryIcon, SmartLink } from './VisualHelpers';

interface InventoryListProps {
  inventory: InventoryState;
  settings: ReturnType<typeof useInventory>['settings'];
  highlightItemId?: InventoryItemId;
  onNavigate: OnNavigate;
}

const getItemStatus = (item: InventoryItem, inventory: InventoryState, settings: InventoryListProps['settings']) => {
    const currentStock = inventory[item.id] || 0;
    const thresholds = settings.stockThresholds[item.id];
    
    if (currentStock < thresholds.low) {
        return { text: 'Low', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' };
    }
    if (currentStock < thresholds.ideal) {
        return { text: 'Sufficient', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' };
    }
    return { text: 'Good', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' };
};


const InventoryList: React.FC<InventoryListProps> = ({ inventory, settings, highlightItemId, onNavigate }) => {
  const itemRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (highlightItemId && itemRefs.current[highlightItemId]) {
      itemRefs.current[highlightItemId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightItemId]);

  const groupedItems = INVENTORY_ITEMS.reduce((acc, item) => {
    const category = item.category;
    const subCategory = item.subCategory;

    if (!acc[category]) {
      acc[category] = {};
    }
    if (!acc[category][subCategory]) {
      acc[category][subCategory] = [];
    }
    acc[category][subCategory].push(item);
    return acc;
  }, {} as Record<Category, Record<string, typeof INVENTORY_ITEMS>>);

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Full Inventory</h2>
      {Object.entries(groupedItems).map(([category, subCategories]) => (
        <div key={category}>
          <h3 className="text-2xl font-semibold text-brand-dark dark:text-gray-200 mb-4 border-b-2 border-brand-red pb-2">{category}</h3>
          {Object.entries(subCategories).sort(([subA], [subB]) => subA.localeCompare(subB)).map(([subCategory, items]) => (
             <div key={subCategory} className="mb-8">
              <h4 className="text-xl font-medium text-brand-gray dark:text-gray-300 mb-3">{subCategory}</h4>
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item Name</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Stock</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unit</th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {items.sort((a,b) => a.name.localeCompare(b.name)).map((item) => {
                        const currentStock = inventory[item.id] || 0;
                        const status = getItemStatus(item, inventory, settings);
                        const formatStock = (stock: number) => item.unit === 'rolls' ? stock.toFixed(2) : stock.toLocaleString();
                        const isHighlighted = highlightItemId === item.id;

                        return (
                            <tr 
                                key={item.id} 
                                ref={el => {itemRefs.current[item.id] = el}}
                                className={`
                                    transition-colors duration-500
                                    ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900/30 animate-pulse' : 'odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600'}
                                `}
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                  <div className="flex items-center space-x-3">
                                      <CategoryIcon category={item.category} subCategory={item.subCategory} />
                                      <span>{item.name}</span>
                                  </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300 font-mono">
                                {formatStock(currentStock)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 capitalize">{item.unit}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    <span 
                                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color}`}
                                    >
                                        {status.text}
                                    </span>
                              </td>
                            </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default InventoryList;