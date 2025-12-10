import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Category, InventoryState, InventoryItemId, OnNavigate } from '../types';
import { INVENTORY_ITEMS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import EditTransactionModal from './EditTransactionModal';
import ConfirmationModal from './ConfirmationModal';
import StockUsageModal from './StockUsageModal';
import { SmartLink } from './VisualHelpers';

interface StockHistoryProps {
  transactions: Transaction[];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  settings: ReturnType<typeof useInventory>['settings'];
  inventory: InventoryState;
  initialStockId?: string;
  onNavigate: OnNavigate;
}

type StockTransaction = Transaction & { 
    itemId: InventoryItemId;
    itemName: string; 
    category: Category; 
    unit: string; 
    quantity: number;
    stockId?: string; 
    displayStatus?: 'normal' | 'deleted' | 'modified-original' | 'new';
};

type SortKey = 'date' | 'orderNumber' | 'itemName' | 'quantity';
type SortDirection = 'asc' | 'desc';

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const StockHistory: React.FC<StockHistoryProps> = ({ transactions, updateTransaction, deleteTransaction, settings, inventory, initialStockId, onNavigate }) => {
  const [viewMode, setViewMode] = useState<'byItem' | 'byDate'>('byItem');
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc',
  });

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Transaction>>(new Map());
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [idsToMerge, setIdsToMerge] = useState<string[]>([]); // For bulk edit merging
  
  const [itemsToDelete, setItemsToDelete] = useState<string[] | null>(null); // Changed to array for bulk delete
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  // Usage Modal State
  const [usageModalData, setUsageModalData] = useState<{ stockId: string, itemId: InventoryItemId, itemName: string } | null>(null);

  // Effect to auto-open modal if stock ID is provided via navigation
  useEffect(() => {
    if (initialStockId) {
        // Find transaction to get item details
        const tx = transactions.find(t => t.type === 'IN' && t.details.some(d => d.stockId === initialStockId));
        if (tx) {
            const detail = tx.details.find(d => d.stockId === initialStockId);
            if (detail) {
                setUsageModalData({
                    stockId: initialStockId,
                    itemId: detail.itemId,
                    itemName: detail.itemName
                });
            }
        }
    }
  }, [initialStockId, transactions]);


  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // --- DATA PROCESSING FOR 'BY ITEM' VIEW ---
  const stockByCategory = useMemo<Record<string, StockTransaction[]>>(() => {
    const grouped: Record<string, StockTransaction[]> = {};
    
    transactions
      .filter(t => t.type === 'IN' && t.details.length > 0)
      .forEach(originalTx => {
         const updatedTx = pendingUpdates.get(originalTx.id);
         const isDeleted = pendingDeletes.has(originalTx.id);

         const processTx = (t: Transaction, status: StockTransaction['displayStatus']) => {
             // Iterate ALL details to ensure mixed transactions appear in all relevant tables
             t.details.forEach(detail => {
                 const itemInfo = ITEMS_MAP.get(detail.itemId);
                 if(itemInfo) {
                     const groupKey = itemInfo.name;

                     if (!grouped[groupKey]) grouped[groupKey] = [];

                     grouped[groupKey].push({
                         ...t,
                         itemId: itemInfo.id,
                         itemName: itemInfo.name,
                         category: itemInfo.category,
                         unit: itemInfo.unit,
                         quantity: detail.quantity,
                         stockId: detail.stockId,
                         displayStatus: status
                     });
                 }
             });
         };

         // Process Original
         let originalStatus: StockTransaction['displayStatus'] = 'normal';
         if (isDeleted) originalStatus = 'deleted';
         else if (updatedTx) originalStatus = 'modified-original';
         processTx(originalTx, originalStatus);

         // Process New
         if (updatedTx) {
             processTx(updatedTx, 'new');
         }
      });

    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.key) {
          case 'date':
            comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            break;
          case 'quantity':
            comparison = a.quantity - b.quantity;
            break;
          case 'itemName':
            comparison = a.itemName.localeCompare(b.itemName);
            break;
          case 'orderNumber':
            // Comparison based on Stock ID if available, else Order Number
            const aId = a.stockId || a.orderNumber || '';
            const bId = b.stockId || b.orderNumber || '';
            comparison = aId.localeCompare(bId);
            break;
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    });

    return grouped;
  }, [transactions, sortConfig, pendingDeletes, pendingUpdates]);

  const groupedInventory = useMemo(() => {
    return INVENTORY_ITEMS.reduce((acc, item) => {
      const cat = item.category;
      const sub = item.subCategory;
      if (!acc[cat]) acc[cat] = {};
      if (!acc[cat][sub]) acc[cat][sub] = [];
      acc[cat][sub].push(item);
      return acc;
    }, {} as Record<Category, Record<string, typeof INVENTORY_ITEMS>>);
  }, []);

  // --- DATA PROCESSING FOR 'BY DATE' VIEW ---
  // Returns a list of "Display Groups".
  // Each group has a header (PO or No PO) and a list of transactions to render merged.
  const stockByDate = useMemo(() => {
      // 1. First, organize by Date string
      const byDate: Record<string, (Transaction & { displayStatus?: string })[]> = {};
      
      transactions.filter(t => t.type === 'IN').forEach(originalTx => {
         const updatedTx = pendingUpdates.get(originalTx.id);
         const isDeleted = pendingDeletes.has(originalTx.id);
         
         if (isDeleted) {
             if(isEditMode) {
                 const d = new Date(originalTx.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                 if(!byDate[d]) byDate[d] = [];
                 byDate[d].push({ ...originalTx, displayStatus: 'deleted' });
             }
         } else if (updatedTx) {
             if(isEditMode) {
                 const d1 = new Date(originalTx.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                 if(!byDate[d1]) byDate[d1] = [];
                 byDate[d1].push({ ...originalTx, displayStatus: 'modified-original' });
             }
             const d2 = new Date(updatedTx.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
             if(!byDate[d2]) byDate[d2] = [];
             byDate[d2].push({ ...updatedTx, displayStatus: 'new' });
         } else {
             const d = new Date(originalTx.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
             if(!byDate[d]) byDate[d] = [];
             byDate[d].push(originalTx);
         }
      });

      // 2. Sort Dates
      const sortedDates = Object.keys(byDate).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());

      // 3. Within each Date, group by PO for visual merging
      const finalStructure: { dateStr: string, groups: { orderNumber: string, txs: (Transaction & { displayStatus?: string })[] }[] }[] = [];

      sortedDates.forEach(dateStr => {
          const txs = byDate[dateStr];
          
          const groupedByPO: Record<string, typeof txs> = {};
          txs.forEach(tx => {
              // Only group if PO exists. If no PO, keep separate by using ID in key.
              if (tx.orderNumber) {
                  const key = tx.orderNumber;
                  if(!groupedByPO[key]) groupedByPO[key] = [];
                  groupedByPO[key].push(tx);
              } else {
                  // Unique key for NO PO items so they don't merge
                  const key = `__NO_PO_${tx.id}`;
                  groupedByPO[key] = [tx];
              }
          });

          // Convert back to array
          const groups = Object.values(groupedByPO).map(groupTxs => ({
              orderNumber: groupTxs[0].orderNumber || '', // Use common PO
              txs: groupTxs
          }));
          finalStructure.push({ dateStr, groups });
      });

      return finalStructure;
  }, [transactions, pendingUpdates, pendingDeletes, isEditMode]);


  // Actions
  const initiateEditGroup = (txs: Transaction[]) => {
      if (txs.length === 0) return;

      if (txs.length === 1) {
          setEditingTransaction(txs[0]);
          setIdsToMerge([]);
          return;
      }

      // Merge logic: Combine details from all transactions into one
      const base = txs[0];
      const combinedDetails = txs.flatMap(t => t.details);
      
      const mergedTx: Transaction = {
          ...base,
          details: combinedDetails,
          description: `Stock Received ${base.orderNumber ? `(PO: ${base.orderNumber})` : '(No PO)'}`
      };

      setIdsToMerge(txs.slice(1).map(t => t.id)); // Store IDs of subsumed transactions
      setEditingTransaction(mergedTx);
  };
  
  const confirmEdit = (updatedTx: Transaction) => {
      // Update the base transaction
      setPendingUpdates(prev => new Map(prev).set(updatedTx.id, updatedTx));
      
      // Mark subsumed transactions as deleted
      if (idsToMerge.length > 0) {
          setPendingDeletes(prev => {
              const next = new Set(prev);
              idsToMerge.forEach(id => next.add(id));
              return next;
          });
          setIdsToMerge([]);
      }

      setEditingTransaction(null);
  };

  const initiateDeleteGroup = (txs: Transaction[]) => {
      setItemsToDelete(txs.map(t => t.id));
  };

  const confirmDelete = () => {
      if (itemsToDelete && itemsToDelete.length > 0) {
          setPendingDeletes(prev => {
              const next = new Set(prev);
              itemsToDelete.forEach(id => next.add(id));
              return next;
          });
          
          // If any were pending updates, remove them from updates map
          setPendingUpdates(prev => {
              const next = new Map(prev);
              itemsToDelete.forEach(id => next.delete(id));
              return next;
          });

          setItemsToDelete(null);
      }
  };

  const undoChange = (id: string) => {
      if (pendingDeletes.has(id)) {
          setPendingDeletes(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
          });
      }
      if (pendingUpdates.has(id)) {
          setPendingUpdates(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
          });
      }
  };

  const initiateSave = () => {
      if (pendingDeletes.size === 0 && pendingUpdates.size === 0) {
          setIsEditMode(false);
          return;
      }
      setShowSaveConfirmation(true);
  };

  const performSave = () => {
      pendingDeletes.forEach(id => deleteTransaction(id));
      pendingUpdates.forEach(tx => updateTransaction(tx));
      setIsEditMode(false);
      setPendingDeletes(new Set());
      setPendingUpdates(new Map());
      setShowSaveConfirmation(false);
  };

  const cancelAllChanges = () => {
      setIsEditMode(false);
      setPendingDeletes(new Set());
      setPendingUpdates(new Map());
  };

  const TableHeader = ({ label, column, align = 'left' }: { label: string; column: SortKey; align?: 'left' | 'right' }) => (
    <th 
        scope="col" 
        className={`px-6 py-3 text-${align} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none`}
        onClick={() => handleSort(column)}
    >
        <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
            {label}
        </div>
    </th>
  );

  const getRowStyle = (status?: string) => {
      if (status === 'deleted' || status === 'modified-original') {
          return "bg-gray-50 dark:bg-gray-800 opacity-60 text-gray-400 line-through hover:bg-gray-100";
      }
      if (status === 'new') {
          return "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500";
      }
      return "odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors";
  };

  return (
    <div className="space-y-8">
        {editingTransaction && (
            <EditTransactionModal
                transaction={editingTransaction}
                onClose={() => { setEditingTransaction(null); setIdsToMerge([]); }}
                onSave={confirmEdit}
                settings={settings}
                inventory={inventory}
            />
        )}
        {usageModalData && (
            <StockUsageModal 
                stockId={usageModalData.stockId}
                itemId={usageModalData.itemId}
                itemName={usageModalData.itemName}
                transactions={transactions}
                onClose={() => setUsageModalData(null)}
                onNavigate={onNavigate}
            />
        )}
        <ConfirmationModal 
            isOpen={!!itemsToDelete}
            onClose={() => setItemsToDelete(null)}
            onConfirm={confirmDelete}
            title="Mark for Deletion"
            message={`Are you sure you want to mark ${itemsToDelete?.length || 0} record(s) for deletion? You must click 'Save Changes' to apply.`}
        />
        <ConfirmationModal 
            isOpen={showSaveConfirmation}
            onClose={() => setShowSaveConfirmation(false)}
            onConfirm={performSave}
            title="Confirm Changes"
            message={`You are about to delete ${pendingDeletes.size} record(s) and update ${pendingUpdates.size} record(s). This action cannot be undone.`}
        />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Incoming Stock History</h2>
        
        <div className="flex items-center space-x-3">
             <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex space-x-1">
                <button
                    onClick={() => setViewMode('byItem')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'byItem' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                    By Item
                </button>
                <button
                    onClick={() => setViewMode('byDate')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'byDate' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                    By Date
                </button>
             </div>

             {!isEditMode ? (
                <button 
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm"
                >
                    Edit
                </button>
            ) : (
                <>
                    <button 
                        onClick={cancelAllChanges}
                        className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={initiateSave}
                        className="px-4 py-2 bg-brand-red text-white rounded-md shadow-sm hover:bg-red-700 font-medium text-sm"
                    >
                        Save ({pendingDeletes.size + pendingUpdates.size})
                    </button>
                </>
            )}
        </div>
      </div>
      
      {/* --- BY ITEM VIEW --- */}
      {viewMode === 'byItem' && Object.entries(groupedInventory).map(([category, subCategories]) => (
        <div key={category} className="space-y-8 animate-fade-in">
             <h2 className="text-2xl font-bold text-gray-800 dark:text-white sticky top-16 bg-gray-100 dark:bg-gray-900 py-2 z-10 border-b border-gray-200 dark:border-gray-700">{category}</h2>
             
             {Object.entries(subCategories)
                .sort(([subA], [subB]) => subA.localeCompare(subB))
                .map(([subCategory, items]) => (
                <div key={subCategory} className="pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                     <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-6">{subCategory}</h3>
                     
                     <div className="space-y-10">
                     {items
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(item => {
                            const transactionsList = stockByCategory[item.name] || [];
                            
                            return (
                                <div key={item.id} className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex justify-between items-center">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{item.name}</h3>
                                        {transactionsList.length > 0 && (
                                            <span className="text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-2 py-1 rounded-full">
                                                {transactionsList.length} Records
                                            </span>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-800">
                                            <tr>
                                            <TableHeader label="Date" column="date" />
                                            <TableHeader label="Stock ID / Ref" column="orderNumber" />
                                            <TableHeader label="Quantity" column="quantity" align="right" />
                                            {isEditMode && <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                            {transactionsList.length > 0 ? (
                                                transactionsList.map(t => {
                                                    // Determine the best ID to show: specific line item StockID > Transaction OrderNumber (legacy)
                                                    const displayId = t.stockId ? t.stockId : t.orderNumber;
                                                    const secondaryId = t.stockId && t.orderNumber ? t.orderNumber : null; // Vendor PO if StockID exists

                                                    return (
                                                    <tr key={`${t.id}-${t.displayStatus}-${t.stockId || 'no-stock'}`} className={getRowStyle(t.displayStatus)}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                                        {new Date(t.date).toLocaleDateString()}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 font-mono">
                                                            {t.category === 'Raw Materials' && displayId ? (
                                                                <div>
                                                                    <button 
                                                                        onClick={() => setUsageModalData({ stockId: displayId!, itemId: t.itemId, itemName: t.itemName })}
                                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-mono font-medium focus:outline-none"
                                                                        title="Click to trace usage"
                                                                    >
                                                                        {displayId}
                                                                    </button>
                                                                    {secondaryId && (
                                                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                                                            PO: {secondaryId}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                displayId || '-'
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono">
                                                        {t.quantity.toLocaleString()} <span className="text-xs text-gray-500 font-normal">{t.unit}</span>
                                                        {t.description.match(/\((.*)\)/)?.[1] && (
                                                            <div className="text-xs text-gray-400 font-normal mt-1">{t.description.match(/\((.*)\)/)?.[1]}</div>
                                                        )}
                                                        </td>
                                                        {isEditMode && (
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                {t.displayStatus === 'deleted' || t.displayStatus === 'modified-original' ? (
                                                                    <button onClick={() => undoChange(t.id)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300">Undo</button>
                                                                ) : (
                                                                    <div className="flex justify-end space-x-3">
                                                                        {t.displayStatus === 'new' && (
                                                                            <button onClick={() => undoChange(t.id)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">Revert</button>
                                                                        )}
                                                                        <button onClick={() => initiateEditGroup([t])} className="text-brand-red hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Edit</button>
                                                                        <button onClick={() => initiateDeleteGroup([t])} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">Delete</button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                )})
                                            ) : (
                                                <tr>
                                                    <td colSpan={isEditMode ? 4 : 3} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">
                                                        No incoming stock history recorded.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                     </div>
                </div>
             ))}
      </div>
      )}

      {/* --- BY DATE VIEW --- */}
      {viewMode === 'byDate' && (
          <div className="space-y-12 animate-fade-in">
              {stockByDate.length > 0 ? stockByDate.map(({ dateStr, groups }) => (
                  <div key={dateStr} className="relative">
                      <div className="sticky top-20 z-10 mb-4 flex items-center">
                          <div className="bg-brand-red text-white text-sm font-bold px-3 py-1 rounded-full shadow-md">
                              {dateStr}
                          </div>
                          <div className="h-px bg-gray-300 dark:bg-gray-700 flex-grow ml-4"></div>
                      </div>
                      
                      <div className="grid gap-6">
                          {groups.map((group, gIdx) => {
                              // If merging multiple transactions, we take the first one for primary status
                              const primaryTx = group.txs[0];
                              const allDetails = group.txs.flatMap(tx => tx.details);
                              
                              return (
                              <div key={`${dateStr}-${group.orderNumber}-${gIdx}`} className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border-l-4 overflow-hidden ${
                                  primaryTx.displayStatus === 'deleted' ? 'border-gray-400 opacity-60' : 
                                  primaryTx.displayStatus === 'new' ? 'border-green-500' : 'border-blue-500'
                              }`}>
                                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start bg-gray-50 dark:bg-gray-700/30">
                                      <div>
                                          <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                              {group.orderNumber ? (
                                                  <>
                                                    <span className="text-gray-500 dark:text-gray-400 text-sm font-normal">PO:</span>
                                                    <SmartLink 
                                                        type="shipment" 
                                                        value={group.orderNumber} 
                                                        label={<span className="font-mono">{group.orderNumber}</span>} 
                                                        onNavigate={onNavigate} 
                                                    />
                                                  </>
                                              ) : (
                                                  <span className="text-gray-500 dark:text-gray-400 italic">No Vendor PO</span>
                                              )}
                                              {primaryTx.displayStatus === 'new' && <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">New</span>}
                                              {primaryTx.displayStatus === 'modified-original' && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Modified</span>}
                                              {primaryTx.displayStatus === 'deleted' && <span className="bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Deleted</span>}
                                          </h4>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                              {group.txs.length > 1 ? `Merged ${group.txs.length} transactions` : primaryTx.description}
                                          </p>
                                      </div>
                                      
                                      {isEditMode && (
                                          <div className="flex space-x-2">
                                               {primaryTx.displayStatus === 'deleted' || primaryTx.displayStatus === 'modified-original' ? (
                                                    <button onClick={() => undoChange(primaryTx.id)} className="text-sm text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Undo</button>
                                                ) : (
                                                    <>
                                                        {primaryTx.displayStatus === 'new' && (
                                                            <button onClick={() => undoChange(primaryTx.id)} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium">Revert</button>
                                                        )}
                                                        <button onClick={() => initiateEditGroup(group.txs)} className="text-sm text-brand-red hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 font-medium">Edit</button>
                                                        <button onClick={() => initiateDeleteGroup(group.txs)} className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium">Delete</button>
                                                    </>
                                                )}
                                          </div>
                                      )}
                                  </div>
                                  
                                  <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                          <thead className="bg-white dark:bg-gray-800">
                                              <tr>
                                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock ID / Notes</th>
                                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quantity</th>
                                              </tr>
                                          </thead>
                                          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                              {allDetails.map((detail, idx) => {
                                                  const item = ITEMS_MAP.get(detail.itemId);
                                                  return (
                                                      <tr key={`detail-${idx}`} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                                          <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                                                              <SmartLink 
                                                                    type="inventory" 
                                                                    value={detail.itemId} 
                                                                    label={item?.name || detail.itemName} 
                                                                    onNavigate={onNavigate}
                                                                    className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400" 
                                                              />
                                                              <div className="text-xs text-gray-500 font-normal">{item?.category} - {item?.subCategory}</div>
                                                          </td>
                                                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-300">
                                                              {(detail.stockId || (!detail.stockId && group.orderNumber)) && (
                                                                  <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded w-fit mb-1 border border-gray-200 dark:border-gray-600">
                                                                      {detail.stockId ? `ID: ${detail.stockId}` : `ID: ${group.orderNumber}`}
                                                                  </div>
                                                              )}
                                                              {detail.notes && <div className="italic text-xs">{detail.notes}</div>}
                                                          </td>
                                                          <td className="px-4 py-2 text-sm text-right font-mono font-bold text-gray-900 dark:text-white">
                                                              {detail.quantity} <span className="text-xs font-normal text-gray-500">{item?.unit}</span>
                                                          </td>
                                                      </tr>
                                                  );
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          )})}
                      </div>
                  </div>
              )) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                      <p>No incoming stock history found.</p>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default StockHistory;