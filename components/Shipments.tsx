
import React, { useMemo, useState } from 'react';
import { Transaction, Customer } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import EditTransactionModal from './EditTransactionModal';
import ConfirmationModal from './ConfirmationModal';

interface ShipmentsProps {
  transactions: Transaction[];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  settings: ReturnType<typeof useInventory>['settings'];
}

type ShipmentTransaction = Transaction & { 
    productName: string;
    displayStatus?: 'normal' | 'deleted' | 'modified-original' | 'new';
};
type SortKey = 'date' | 'orderNumber' | 'productName' | 'cartonsShipped';
type SortDirection = 'asc' | 'desc';

const Shipments: React.FC<ShipmentsProps> = ({ transactions, updateTransaction, deleteTransaction, settings }) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc',
  });

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Transaction>>(new Map());
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Data Processing
  const shipmentsByCustomer = useMemo<Record<string, ShipmentTransaction[]>>(() => {
    const grouped: Record<string, ShipmentTransaction[]> = {};
    const customers: Customer[] = ['PHSA', 'PADM', 'Alliance'];
    customers.forEach(c => grouped[c] = []);

    // Create a display list combining original and pending updates
    transactions.filter(t => t.type === 'SHIPMENT' && t.productId).forEach(originalTx => {
        // If this ID is in pendingUpdates, we need to show BOTH the original (struck) and new (highlighted)
        // unless the logic implies simple replacement. Prompt asked for "strike through previous data".
        
        const updatedTx = pendingUpdates.get(originalTx.id);
        const isDeleted = pendingDeletes.has(originalTx.id);

        // 1. Process Original
        const originalProduct = FINISHED_PRODUCTS.find(p => p.id === originalTx.productId);
        if (originalProduct) {
            if (!grouped[originalProduct.customer]) grouped[originalProduct.customer] = [];
            
            let status: ShipmentTransaction['displayStatus'] = 'normal';
            if (isDeleted) status = 'deleted';
            else if (updatedTx) status = 'modified-original';
            
            grouped[originalProduct.customer].push({
                ...originalTx,
                productName: originalProduct.name,
                displayStatus: status
            });
        }

        // 2. Process Update (New Version)
        if (updatedTx) {
             const updatedProduct = FINISHED_PRODUCTS.find(p => p.id === updatedTx.productId);
             if (updatedProduct) {
                 if (!grouped[updatedProduct.customer]) grouped[updatedProduct.customer] = [];
                 grouped[updatedProduct.customer].push({
                     ...updatedTx,
                     productName: updatedProduct.name,
                     displayStatus: 'new'
                 });
             }
        }
    });

    // Sort each group
    Object.keys(grouped).forEach(customer => {
      grouped[customer].sort((a, b) => {
        // Always push deleted/modified-original to the bottom if they are annoying, 
        // OR keep them in place. Sorting by date is usually best.
        // However, let's keep the new item next to old if possible? 
        // With date sorting, they will likely be close.
        
        let comparison = 0;
        switch (sortConfig.key) {
          case 'date':
            comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            break;
          case 'cartonsShipped':
            comparison = (a.cartonsShipped || 0) - (b.cartonsShipped || 0);
            break;
          case 'productName':
            comparison = a.productName.localeCompare(b.productName);
            break;
          case 'orderNumber':
            comparison = (a.orderNumber || '').localeCompare(b.orderNumber || '');
            break;
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    });

    return grouped;
  }, [transactions, sortConfig, pendingDeletes, pendingUpdates]);

  // Actions
  const initiateEdit = (tx: Transaction) => {
      setEditingTransaction(tx);
  };
  
  const confirmEdit = (updatedTx: Transaction) => {
      setPendingUpdates(prev => new Map(prev).set(updatedTx.id, updatedTx));
      setEditingTransaction(null);
  };

  const initiateDelete = (id: string) => {
      setItemToDelete(id);
  };

  const confirmDelete = () => {
      if (itemToDelete) {
          setPendingDeletes(prev => new Set(prev).add(itemToDelete));
          // If it was updated pending, remove the update to just show deleted
          if (pendingUpdates.has(itemToDelete)) {
              setPendingUpdates(prev => {
                  const next = new Map(prev);
                  next.delete(itemToDelete);
                  return next;
              });
          }
          setItemToDelete(null);
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

  // Render Helpers
  const renderSortIcon = (column: SortKey) => {
    const isActive = sortConfig.key === column;
    return (
      <span className="ml-2 flex-none text-gray-400">
        {!isActive ? (
            <svg className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        ) : sortConfig.direction === 'asc' ? (
            <svg className="h-4 w-4 text-brand-red" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
        ) : (
            <svg className="h-4 w-4 text-brand-red" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        )}
      </span>
    );
  };

  const TableHeader = ({ label, column, align = 'left' }: { label: string; column: SortKey; align?: 'left' | 'right' }) => (
    <th 
        scope="col" 
        className={`px-6 py-3 text-${align} text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none`}
        onClick={() => handleSort(column)}
    >
        <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
            {label}
            {renderSortIcon(column)}
        </div>
    </th>
  );
  
  const getRowStyle = (status?: ShipmentTransaction['displayStatus']) => {
      if (status === 'deleted' || status === 'modified-original') {
          return "bg-gray-50 dark:bg-gray-800 opacity-60 text-gray-400 line-through hover:bg-gray-100";
      }
      if (status === 'new') {
          return "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500";
      }
      return "hover:bg-gray-50 dark:hover:bg-gray-700/50";
  };

  return (
    <div className="space-y-8">
        {editingTransaction && (
            <EditTransactionModal
                transaction={editingTransaction}
                onClose={() => setEditingTransaction(null)}
                onSave={confirmEdit}
                settings={settings}
            />
        )}
        <ConfirmationModal 
            isOpen={!!itemToDelete}
            onClose={() => setItemToDelete(null)}
            onConfirm={confirmDelete}
            title="Mark for Deletion"
            message="Are you sure you want to mark this record for deletion? You must click 'Save Changes' to apply."
        />
        <ConfirmationModal 
            isOpen={showSaveConfirmation}
            onClose={() => setShowSaveConfirmation(false)}
            onConfirm={performSave}
            title="Confirm Changes"
            message={`You are about to delete ${pendingDeletes.size} record(s) and update ${pendingUpdates.size} record(s). This action cannot be undone.`}
        />

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Shipment History</h2>
        <div className="space-x-4">
            {!isEditMode ? (
                <button 
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm"
                >
                    Edit Table
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
                        Save Changes ({pendingDeletes.size + pendingUpdates.size})
                    </button>
                </>
            )}
        </div>
      </div>
      
      {Object.entries(shipmentsByCustomer).map(([customer, customerShipments]) => {
         const shipments = customerShipments as ShipmentTransaction[];
         // For totals, don't count deleted, do count new, don't count modified-original
         const activeShipments = shipments.filter(s => s.displayStatus !== 'deleted' && s.displayStatus !== 'modified-original');
         const totalCartons = activeShipments.reduce((sum, t) => sum + (t.cartonsShipped || 0), 0);
         
         if (shipments.length === 0) return null;

         return (
            <div key={customer} className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{customer}</h3>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Total Shipped: {totalCartons.toLocaleString()} Cartons
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <TableHeader label="Date" column="date" />
                      <TableHeader label="Order #" column="orderNumber" />
                      <TableHeader label="Product" column="productName" />
                      <TableHeader label="Cartons" column="cartonsShipped" align="right" />
                      {isEditMode && <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {shipments.map((t, idx) => (
                      <tr key={`${t.id}-${t.displayStatus}`} className={getRowStyle(t.displayStatus)}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                          {new Date(t.date).toLocaleDateString()}
                        </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 font-mono">
                          {t.orderNumber || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {t.productName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono">
                          {t.cartonsShipped?.toLocaleString()}
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
                                        <button onClick={() => initiateEdit(t)} className="text-brand-red hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Edit</button>
                                        <button onClick={() => initiateDelete(t.id)} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">Delete</button>
                                    </div>
                                )}
                            </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
         );
      })}
      
      {Object.values(shipmentsByCustomer).every((arr) => (arr as ShipmentTransaction[]).length === 0) && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <p>No shipments recorded yet.</p>
          </div>
      )}
    </div>
  );
};

export default Shipments;
