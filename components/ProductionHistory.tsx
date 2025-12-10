
import React, { useMemo, useState } from 'react';
import { Transaction, Customer, InventoryState, ProductId, InventoryItemId, OnNavigate } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import ConfirmationModal from './ConfirmationModal';
import EditTransactionModal from './EditTransactionModal';
import { ProductBadge, LotNumberDisplay, SmartLink } from './VisualHelpers';

interface ProductionHistoryProps {
  transactions: Transaction[];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  settings: ReturnType<typeof useInventory>['settings'];
  inventory: InventoryState;
  onNavigate: OnNavigate;
}

type ProductionTransaction = Transaction & { 
    productName: string;
    missingMaterials: boolean;
};
type SortKey = 'date' | 'orderNumber' | 'productName' | 'cartonsProduced';
type SortDirection = 'asc' | 'desc';

const ProductionHistory: React.FC<ProductionHistoryProps> = ({ transactions, updateTransaction, deleteTransaction, settings, inventory, onNavigate }) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc',
  });

  // Mode State
  const [isManageMode, setIsManageMode] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const productionByCustomer = useMemo<Record<string, ProductionTransaction[]>>(() => {
    const grouped: Record<string, ProductionTransaction[]> = {};
    const customers: Customer[] = ['PHSA', 'PADM', 'Alliance'];
    customers.forEach(c => grouped[c] = []);

    transactions
      .filter(t => (t.type === 'PRODUCTION' || t.type === 'OUT') && t.productId)
      .forEach(tx => {
        const product = FINISHED_PRODUCTS.find(p => p.id === tx.productId);
        if (product) {
            if (!grouped[product.customer]) grouped[product.customer] = [];
            
            // Check for missing materials
            let missingMaterials = false;
            if (tx.productId) {
                 const formula = settings.productFormulas[tx.productId as ProductId];
                 if (formula) {
                     // Updated: Check missing materials even if excluded from capacity planning
                     const required = (Object.values(formula.rawMaterials) as InventoryItemId[]);
                     const linked = tx.materialLinkage ? Object.keys(tx.materialLinkage) : [];
                     missingMaterials = required.some(reqId => !linked.includes(reqId));
                 }
            }

            grouped[product.customer].push({
                ...tx,
                productName: product.name,
                missingMaterials
            });
        }
      });

    Object.keys(grouped).forEach(customer => {
      grouped[customer].sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.key) {
          case 'date':
            comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            break;
          case 'cartonsProduced':
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
  }, [transactions, sortConfig, settings]);

  const sortedCustomerKeys = useMemo(() => {
      const keys = Object.keys(productionByCustomer);
      const priority = ['Alliance', 'PHSA', 'PADM'];
      return keys.sort((a, b) => {
          const idxA = priority.indexOf(a);
          const idxB = priority.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
      });
  }, [productionByCustomer]);

  const confirmEdit = (updatedTx: Transaction) => {
      updateTransaction(updatedTx);
      setEditingTransaction(null);
  };

  const confirmDelete = () => {
      if (itemToDelete) {
          deleteTransaction(itemToDelete);
          setItemToDelete(null);
      }
  };

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

  return (
    <div className="space-y-8">
        {editingTransaction && (
            <EditTransactionModal
                transaction={editingTransaction}
                onClose={() => setEditingTransaction(null)}
                onSave={confirmEdit}
                settings={settings}
                inventory={inventory}
                transactions={transactions}
                allowMaterialEditing={false}
            />
        )}
        <ConfirmationModal 
            isOpen={!!itemToDelete}
            onClose={() => setItemToDelete(null)}
            onConfirm={confirmDelete}
            title="Delete Production Record"
            message="Are you sure you want to delete this production record? This will revert the stock deductions."
        />

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Production History</h2>
        <div className="space-x-4">
             <button 
                onClick={() => setIsManageMode(!isManageMode)}
                className={`px-4 py-2 border rounded-md shadow-sm font-medium text-sm transition-colors ${isManageMode ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600'}`}
            >
                {isManageMode ? 'Done Managing' : 'Manage Records'}
            </button>
        </div>
      </div>
      
      {sortedCustomerKeys.map((customer) => {
         const customerProduction = productionByCustomer[customer];
         const totalCartons = customerProduction.reduce((sum, t) => sum + (t.cartonsShipped || 0), 0);
         
         if (customerProduction.length === 0) return null;

         // Group transactions by Product Name to create sub-tables
         const txsByProduct = customerProduction.reduce((acc, tx) => {
             if (!acc[tx.productName]) acc[tx.productName] = [];
             acc[tx.productName].push(tx);
             return acc;
         }, {} as Record<string, ProductionTransaction[]>);

         const productNames = Object.keys(txsByProduct).sort();

         return (
            <div key={customer} className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden mb-8 border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{customer}</h3>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Total Produced: {totalCartons.toLocaleString()} Cartons
                </span>
              </div>
              
              <div className="p-4 sm:p-6 space-y-8">
                  {productNames.map(productName => {
                      const productTxs = txsByProduct[productName];
                      const productTotal = productTxs.reduce((sum, t) => sum + (t.cartonsShipped || 0), 0);

                      return (
                          <div key={productName} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                              <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                  <h4 className="text-md font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                     <ProductBadge name={productName} hideCustomer={true} />
                                  </h4>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {productTotal.toLocaleString()} Cartons
                                  </span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                  <thead className="bg-white dark:bg-gray-800">
                                    <tr>
                                      <TableHeader label="Date" column="date" />
                                      <TableHeader label="Lot Number" column="orderNumber" />
                                      <TableHeader label="Cartons" column="cartonsProduced" align="right" />
                                      {isManageMode && <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {productTxs.map(t => (
                                      <tr key={t.id} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                          {new Date(t.date).toLocaleDateString()}
                                        </td>
                                         <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 font-mono min-w-[150px] flex items-center">
                                            {t.orderNumber ? (
                                                <SmartLink 
                                                    type="lot" 
                                                    value={t.orderNumber} 
                                                    label={<LotNumberDisplay value={t.orderNumber} />} 
                                                    onNavigate={onNavigate} 
                                                />
                                            ) : '-'}
                                             {t.missingMaterials && (
                                                <span className="ml-2 text-amber-500" title="Missing Raw Material Linkage">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                </span>
                                             )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono">
                                             {t.cartonsShipped?.toLocaleString()}
                                        </td>
                                        {isManageMode && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end space-x-3 items-center">
                                                    <button onClick={() => setEditingTransaction(t)} className="text-brand-red hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">Edit</button>
                                                    <button onClick={() => setItemToDelete(t.id)} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">Delete</button>
                                                </div>
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
              </div>
            </div>
         );
      })}
      
      {Object.values(productionByCustomer).every((arr) => (arr as ProductionTransaction[]).length === 0) && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
              <p>No production records found.</p>
          </div>
      )}
    </div>
  );
};

export default ProductionHistory;