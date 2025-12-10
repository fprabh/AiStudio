import React, { useMemo, useState } from 'react';
import { Transaction, Customer, ProductState, LotState } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';
import EditTransactionModal from './EditTransactionModal';
import ConfirmationModal from './ConfirmationModal';

interface ShipmentsProps {
  transactions: Transaction[];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  settings: ReturnType<typeof useInventory>['settings'];
  productInventory: ProductState;
  lotState: LotState;
}

type ShipmentTransaction = Transaction & { 
    productName: string;
    displayStatus?: 'normal' | 'deleted' | 'modified-original' | 'new';
};

const Shipments: React.FC<ShipmentsProps> = ({ transactions, updateTransaction, deleteTransaction, settings, productInventory, lotState }) => {
  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Transaction>>(new Map());
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  // Pre-calculate DB stats for accurate "Available" calculation
  const dbStats = useMemo(() => {
    const stats: Record<string, number> = {}; // productId -> total shipped
    transactions.forEach(t => {
        if (t.type === 'SHIPMENT' && t.productId && t.cartonsShipped) {
             stats[t.productId] = (stats[t.productId] || 0) + t.cartonsShipped;
        }
    });
    return stats;
  }, [transactions]);

  // Calculate Effective Lot State based on Pending Changes
  const effectiveLotState = useMemo(() => {
      const state = { ...lotState };
      
      pendingUpdates.forEach((updatedTx, id) => {
          const originalTx = transactions.find(t => t.id === id);
          if (originalTx && originalTx.type === 'SHIPMENT' && originalTx.lotAllocations) {
              Object.entries(originalTx.lotAllocations).forEach(([lot, qty]) => {
                  state[lot] = (state[lot] ?? 0) + (qty as number);
              });
          }
          if (updatedTx.type === 'SHIPMENT' && updatedTx.lotAllocations) {
               Object.entries(updatedTx.lotAllocations).forEach(([lot, qty]) => {
                  state[lot] = (state[lot] || 0) - (qty as number);
              });
          }
      });

      pendingDeletes.forEach(id => {
          const originalTx = transactions.find(t => t.id === id);
           if (originalTx && originalTx.type === 'SHIPMENT' && originalTx.lotAllocations) {
              Object.entries(originalTx.lotAllocations).forEach(([lot, qty]) => {
                  state[lot] = (state[lot] ?? 0) + (qty as number);
              });
          }
      });

      return state;
  }, [lotState, pendingUpdates, pendingDeletes, transactions]);


  // Data Processing - Group By Customer, then By Order Number (PO)
  const shipmentsByCustomer = useMemo<Record<string, ShipmentTransaction[]>>(() => {
    const grouped: Record<string, ShipmentTransaction[]> = {};
    const customers: Customer[] = ['PHSA', 'PADM', 'Alliance'];
    customers.forEach(c => grouped[c] = []);

    transactions.filter(t => t.type === 'SHIPMENT' && t.productId).forEach(originalTx => {
        const updatedTx = pendingUpdates.get(originalTx.id);
        const isDeleted = pendingDeletes.has(originalTx.id);

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

    // Final sorting for each customer: Date Desc, then PO Number
    Object.keys(grouped).forEach(customer => {
      grouped[customer].sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          // If dates match, group by PO
          return (a.orderNumber || '').localeCompare(b.orderNumber || '');
      });
    });

    return grouped;
  }, [transactions, pendingDeletes, pendingUpdates]);

  const shipmentSummary = useMemo<Record<string, { total: number; products: Record<string, number> }>>(() => {
    const summary: Record<string, { total: number; products: Record<string, number> }> = {};
    
    (Object.entries(shipmentsByCustomer) as [string, ShipmentTransaction[]][]).forEach(([customer, txs]) => {
         const activeTxs = txs.filter(t => t.displayStatus !== 'deleted' && t.displayStatus !== 'modified-original');
         if (activeTxs.length > 0) {
             if (!summary[customer]) summary[customer] = { total: 0, products: {} };
             activeTxs.forEach(t => {
                 const qty = t.cartonsShipped || 0;
                 summary[customer].total += qty;
                 summary[customer].products[t.productName] = (summary[customer].products[t.productName] || 0) + qty;
             });
         }
    });
    return summary;
  }, [shipmentsByCustomer]);

  // Actions
  const initiateEdit = (tx: Transaction) => setEditingTransaction(tx);
  const confirmEdit = (updatedTx: Transaction) => {
      setPendingUpdates(prev => new Map(prev).set(updatedTx.id, updatedTx));
      setEditingTransaction(null);
  };
  const initiateDelete = (id: string) => setItemToDelete(id);
  const confirmDelete = () => {
      if (itemToDelete) {
          setPendingDeletes(prev => new Set(prev).add(itemToDelete));
          if (pendingUpdates.has(itemToDelete)) {
              setPendingUpdates(prev => { const next = new Map(prev); next.delete(itemToDelete); return next; });
          }
          setItemToDelete(null);
      }
  };
  const undoChange = (id: string) => {
      if (pendingDeletes.has(id)) {
          setPendingDeletes(prev => { const next = new Set(prev); next.delete(id); return next; });
      }
      if (pendingUpdates.has(id)) {
          setPendingUpdates(prev => { const next = new Map(prev); next.delete(id); return next; });
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

  const getRowStyle = (status?: ShipmentTransaction['displayStatus']) => {
      if (status === 'deleted' || status === 'modified-original') return "bg-gray-50 dark:bg-gray-800 opacity-60 text-gray-400 line-through hover:bg-gray-100";
      if (status === 'new') return "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500";
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
                productInventory={productInventory}
                inventory={undefined}
                transactions={transactions}
                lotState={effectiveLotState}
            />
        )}
        <ConfirmationModal 
            isOpen={!!itemToDelete}
            onClose={() => setItemToDelete(null)}
            onConfirm={confirmDelete}
            title="Mark for Deletion"
            message="Are you sure you want to mark this record for deletion?"
        />
        <ConfirmationModal 
            isOpen={showSaveConfirmation}
            onClose={() => setShowSaveConfirmation(false)}
            onConfirm={performSave}
            title="Confirm Changes"
            message={`You are about to delete ${pendingDeletes.size} record(s) and update ${pendingUpdates.size} record(s).`}
        />

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Shipment History</h2>
        <div className="space-x-4">
            {!isEditMode ? (
                <button onClick={() => setIsEditMode(true)} className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm">Edit Table</button>
            ) : (
                <>
                    <button onClick={cancelAllChanges} className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm">Cancel</button>
                    <button onClick={initiateSave} className="px-4 py-2 bg-brand-red text-white rounded-md shadow-sm hover:bg-red-700 font-medium text-sm">Save Changes</button>
                </>
            )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8 border-l-4 border-brand-red">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Total Shipments Overview</h3>
          {Object.keys(shipmentSummary).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(shipmentSummary).map(([customer, stats]: [string, { total: number; products: Record<string, number> }]) => (
                    <div key={customer} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-200 dark:border-gray-500">
                            <h4 className="font-bold text-lg text-brand-dark dark:text-white">{customer}</h4>
                            <span className="text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-full">{stats.total.toLocaleString()} Total</span>
                        </div>
                        <ul className="space-y-2">
                            {Object.entries(stats.products).map(([product, qty]) => (
                                <li key={product} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600 dark:text-gray-300 font-medium">{product}</span>
                                    <span className="font-mono font-bold text-gray-900 dark:text-white">{(qty as number).toLocaleString()}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No shipment data available.</p>
          )}
      </div>
      
      {(Object.entries(shipmentsByCustomer) as [string, ShipmentTransaction[]][]).map(([customer, shipments]) => {
         const activeShipments = shipments.filter(s => s.displayStatus !== 'deleted' && s.displayStatus !== 'modified-original');
         const totalCartons = activeShipments.reduce((sum, t) => sum + (t.cartonsShipped || 0), 0);
         
         const productStats = FINISHED_PRODUCTS.filter(p => p.customer === customer).map(product => {
                const pid = product.id;
                const currentDbStock = productInventory[pid] || 0;
                const dbShipped = dbStats[pid] || 0;
                const totalProduced = currentDbStock + dbShipped;
                const activeShipped = activeShipments.filter(s => s.productId === pid).reduce((sum, s) => sum + (s.cartonsShipped || 0), 0);
                return { id: pid, name: product.name, shipped: activeShipped, available: totalProduced - activeShipped };
            });

         if (shipments.length === 0 && productStats.length === 0) return null;

         // Group for rendering table
         const rowGroups: { date: string, orderNumber: string, rows: ShipmentTransaction[], totalQty: number }[] = [];
         let currentGroup: typeof rowGroups[0] | null = null;

         shipments.forEach(tx => {
             const dateStr = new Date(tx.date).toLocaleDateString();
             const orderStr = tx.orderNumber || '';
             
             // Check if we can merge with current group
             if (currentGroup && currentGroup.date === dateStr && currentGroup.orderNumber === orderStr && orderStr !== '') {
                 currentGroup.rows.push(tx);
                 currentGroup.totalQty += (tx.cartonsShipped || 0);
             } else {
                 currentGroup = { date: dateStr, orderNumber: orderStr, rows: [tx], totalQty: (tx.cartonsShipped || 0) };
                 rowGroups.push(currentGroup);
             }
         });

         return (
            <div key={customer} className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{customer}</h3>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Total: {totalCartons.toLocaleString()}</span>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700/30 p-4 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Product Summary (Current Stock)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {productStats.map(stat => (
                            <div key={stat.id} className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                                <div className="font-medium text-sm text-gray-900 dark:text-white mb-2 truncate" title={stat.name}>{stat.name}</div>
                                <div className="grid grid-cols-2 gap-y-1 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">Total Sent:</span>
                                    <span className="text-right font-mono font-bold text-blue-600 dark:text-blue-400">{stat.shipped.toLocaleString()}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Available:</span>
                                    <span className={`text-right font-mono font-bold ${stat.available < 0 ? 'text-red-600' : 'text-green-600 dark:text-green-400'}`}>{stat.available.toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order #</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lot Allocation</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cartons</th>
                      {isEditMode && <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {rowGroups.map((group, gIdx) => (
                        group.rows.map((t, idx) => {
                            const isFirstInGroup = idx === 0;
                            const totalAllocated = t.lotAllocations ? Object.values(t.lotAllocations).reduce((a: number, b: number) => a + b, 0) : 0;
                            const isAllocatedFully = totalAllocated === (t.cartonsShipped || 0);

                            return (
                                <tr key={`${t.id}-${t.displayStatus}`} className={getRowStyle(t.displayStatus)}>
                                    {/* Merged Columns for Date and Order # */}
                                    {isFirstInGroup && (
                                        <>
                                            <td rowSpan={group.rows.length} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 align-top border-r border-gray-100 dark:border-gray-700">
                                                {group.date}
                                            </td>
                                            <td rowSpan={group.rows.length} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 font-mono align-top border-r border-gray-100 dark:border-gray-700">
                                                {group.orderNumber || '-'}
                                                {group.rows.length > 1 && group.orderNumber && (
                                                    <div className="text-[10px] bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 px-1 rounded w-fit mt-1">
                                                        Total: {group.totalQty}
                                                    </div>
                                                )}
                                            </td>
                                        </>
                                    )}
                                    {/* Non-Merged Columns */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white align-top">
                                        {t.productName}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 align-top">
                                        {t.lotAllocations && Object.keys(t.lotAllocations).length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {Object.entries(t.lotAllocations).map(([lot, qty]) => (
                                                    <span key={lot} className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 whitespace-nowrap">
                                                        <span className="font-mono font-bold">{lot}</span>: {qty}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-red-500 text-xs italic">Missing Lot Info</span>
                                        )}
                                        {!isAllocatedFully && t.lotAllocations && (
                                            <div className="text-red-500 text-[10px] mt-1">Partial Alloc</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono align-top">
                                        {t.cartonsShipped?.toLocaleString()}
                                    </td>
                                    {isEditMode && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium align-top">
                                            {t.displayStatus === 'deleted' || t.displayStatus === 'modified-original' ? (
                                                <button onClick={() => undoChange(t.id)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400">Undo</button>
                                            ) : (
                                                <div className="flex justify-end space-x-3">
                                                    {t.displayStatus === 'new' && <button onClick={() => undoChange(t.id)} className="text-gray-500 hover:text-gray-700">Revert</button>}
                                                    <button onClick={() => initiateEdit(t)} className="text-brand-red hover:text-red-900 dark:text-red-400">Edit</button>
                                                    <button onClick={() => initiateDelete(t.id)} className="text-gray-600 hover:text-gray-900 dark:text-gray-400">Delete</button>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
         );
      })}
    </div>
  );
};

export default Shipments;