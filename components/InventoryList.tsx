
import React, { useEffect, useRef, useState } from 'react';
import { InventoryState, Category, InventoryItem, OnNavigate, InventoryItemId, Transaction } from '../types';
import { INVENTORY_ITEMS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import { CategoryIcon, SmartLink } from './VisualHelpers';
import ScrapModal from './ScrapModal';
import EditTransactionModal from './EditTransactionModal';
import ConfirmationModal from './ConfirmationModal';

interface InventoryListProps {
  inventory: InventoryState;
  settings: ReturnType<typeof useInventory>['settings'];
  highlightItemId?: InventoryItemId;
  onNavigate: OnNavigate;
  transactions: Transaction[];
  logScrap: (itemId: InventoryItemId, quantity: number, reason: string, date: string) => void;
  updateTransaction: (transaction: Transaction) => void;
  deleteTransaction: (id: string) => void;
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


const InventoryList: React.FC<InventoryListProps> = ({ inventory, settings, highlightItemId, onNavigate, transactions, logScrap, updateTransaction, deleteTransaction }) => {
  const itemRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  
  // Create Scrap State
  const [scrapModalItemId, setScrapModalItemId] = useState<InventoryItemId | null>(null);
  
  // Edit/Delete Scrap State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightItemId && itemRefs.current[highlightItemId]) {
      itemRefs.current[highlightItemId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightItemId]);

  const toggleExpand = (itemId: string) => {
      setExpandedItemId(prev => prev === itemId ? null : itemId);
  };

  const getScrapTransactions = (itemId: string) => {
      return transactions
          .filter(t => t.type === 'SCRAP' && t.details.some(d => d.itemId === itemId))
          .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const handleEditSave = (updatedTx: Transaction) => {
      updateTransaction(updatedTx);
      setEditingTransaction(null);
  };

  const handleDeleteConfirm = () => {
      if (deletingTransactionId) {
          deleteTransaction(deletingTransactionId);
          setDeletingTransactionId(null);
      }
  };

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
      {/* Create New Scrap Modal */}
      {scrapModalItemId && (
          <ScrapModal 
            initialItemId={scrapModalItemId}
            onClose={() => setScrapModalItemId(null)} 
            onSave={(itemId, quantity, reason, date) => {
                logScrap(itemId, quantity, reason, date);
            }} 
          />
      )}

      {/* Edit Scrap Modal */}
      {editingTransaction && (
          <EditTransactionModal 
            transaction={editingTransaction}
            onClose={() => setEditingTransaction(null)}
            onSave={handleEditSave}
            settings={settings}
            inventory={inventory} // Pass current inventory
          />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal 
          isOpen={!!deletingTransactionId}
          onClose={() => setDeletingTransactionId(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete Scrap Record"
          message="Are you sure you want to delete this scrap record? The scrapped quantity will be restored to your inventory."
      />

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
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Scrapped (All Time)</th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {items.sort((a,b) => a.name.localeCompare(b.name)).map((item) => {
                        const currentStock = inventory[item.id] || 0;
                        const status = getItemStatus(item, inventory, settings);
                        const formatStock = (stock: number) => item.unit === 'rolls' ? stock.toFixed(2) : stock.toLocaleString();
                        const isHighlighted = highlightItemId === item.id;
                        
                        const scrapTransactions = getScrapTransactions(item.id);
                        const totalScrapped = scrapTransactions.reduce((sum, t) => {
                            const detail = t.details.find(d => d.itemId === item.id);
                            return sum + (detail ? Math.abs(detail.quantity) : 0);
                        }, 0);
                        const isExpanded = expandedItemId === item.id;

                        return (
                            <React.Fragment key={item.id}>
                                <tr 
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
                                    {totalScrapped > 0 ? (
                                        <button 
                                            onClick={() => toggleExpand(item.id)}
                                            className="font-mono font-bold text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 underline focus:outline-none flex items-center justify-center w-full"
                                        >
                                            {formatStock(totalScrapped)}
                                            <svg className={`w-4 h-4 ml-1 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                        <span 
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color}`}
                                        >
                                            {status.text}
                                        </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    <button 
                                        onClick={() => setScrapModalItemId(item.id)}
                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs border border-red-200 dark:border-red-800 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                        Scrap
                                    </button>
                                </td>
                                </tr>
                                {isExpanded && totalScrapped > 0 && (
                                    <tr className="bg-gray-50 dark:bg-gray-700/30 shadow-inner">
                                        <td colSpan={6} className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Scrap History</div>
                                                <button onClick={() => toggleExpand(item.id)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                                            </div>
                                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded overflow-hidden max-h-48 overflow-y-auto">
                                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                    <thead className="bg-gray-100 dark:bg-gray-700">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Date</th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Reason</th>
                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Quantity</th>
                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {scrapTransactions.map((tx, idx) => {
                                                            const detail = tx.details.find(d => d.itemId === item.id);
                                                            const qty = detail ? Math.abs(detail.quantity) : 0;
                                                            return (
                                                                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-600/50">
                                                                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                                                                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 italic">{detail?.notes || '-'}</td>
                                                                    <td className="px-4 py-2 text-xs text-right font-mono font-bold text-red-600 dark:text-red-400">{formatStock(qty)}</td>
                                                                    <td className="px-4 py-2 text-xs text-right space-x-2">
                                                                        <button 
                                                                            onClick={() => setEditingTransaction(tx)}
                                                                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => setDeletingTransactionId(tx.id)}
                                                                            className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 font-medium"
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
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
