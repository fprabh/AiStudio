
import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { useInventory } from '../hooks/useInventory';
import EditTransactionModal from './EditTransactionModal';
import ConfirmationModal from './ConfirmationModal';
import { calculateDeductions } from '../utils';

interface TransactionLogProps {
  transactions: Transaction[];
  deleteTransaction: ReturnType<typeof useInventory>['deleteTransaction'];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
  settings: ReturnType<typeof useInventory>['settings'];
}

const TransactionLog: React.FC<TransactionLogProps> = ({ transactions, deleteTransaction, updateTransaction, settings }) => {
  const [sortBy, setSortBy] = useState<'recordDate' | 'transactionDate'>('recordDate');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  const sortedTransactions = useMemo(() => {
    // Filter first
    const filtered = transactions.filter(transaction => {
      if (!searchQuery) return true;
      const lowerCaseQuery = searchQuery.toLowerCase();

      const inDescription = transaction.description.toLowerCase().includes(lowerCaseQuery);
      const inOrderNumber = transaction.orderNumber?.toLowerCase().includes(lowerCaseQuery) || false;
      const inDetails = transaction.details.some(d => d.itemName.toLowerCase().includes(lowerCaseQuery));

      return inDescription || inOrderNumber || inDetails;
    });

    // Then sort
    const sorted = [...filtered];
    if (sortBy === 'transactionDate') {
      sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else {
      // 'recordDate' is assumed to be the default array order (newest first)
      sorted.sort((a, b) => b.id.localeCompare(a.id));
    }
    return sorted;
  }, [transactions, sortBy, searchQuery]);

  const handleDeleteRequest = (transactionId: string) => {
    setTransactionToDelete(transactionId);
  };

  const handleConfirmDelete = () => {
    if (transactionToDelete) {
      deleteTransaction(transactionToDelete);
      setTransactionToDelete(null);
    }
  };
  
  const handleUpdate = (updatedTx: Transaction) => {
      updateTransaction(updatedTx);
      setEditingTransaction(null);
  };

  const getIcon = (type: Transaction['type']) => {
      switch(type) {
          case 'IN':
              return <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414l-3-3z" clipRule="evenodd" /></svg>;
          case 'PRODUCTION':
              // Factory/Gear icon
              return <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>;
          case 'SHIPMENT':
          case 'OUT':
              // Truck icon
              return <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path fillRule="evenodd" d="M3 4a2 2 0 00-2 2v5.5a3.5 3.5 0 003.5 3.5h9A3.5 3.5 0 0017 11.5V6a2 2 0 00-2-2H3zm12.5 7.5a2.5 2.5 0 00-2.5-2.5H3V6h12v5.5z" clipRule="evenodd" /><path d="M14 9H6V7h8v2z" /></svg>;
      }
  }

  const getBadgeClass = (type: Transaction['type']) => {
      switch(type) {
          case 'IN': return 'bg-green-100 text-green-800';
          case 'PRODUCTION': return 'bg-blue-100 text-blue-800';
          case 'SHIPMENT': return 'bg-gray-100 text-gray-800';
          default: return 'bg-gray-100 text-gray-800';
      }
  }
  
  const getBgClass = (type: Transaction['type']) => {
      switch(type) {
          case 'IN': return 'bg-green-500';
          case 'PRODUCTION': return 'bg-blue-500';
          case 'SHIPMENT': return 'bg-brand-dark';
          default: return 'bg-gray-500';
      }
  }

  const getLabel = (type: Transaction['type']) => {
      switch(type) {
          case 'IN': return 'Stock In';
          case 'PRODUCTION': return 'Production';
          case 'SHIPMENT': return 'Shipment Out';
          default: return 'Transaction';
      }
  }

  return (
    <>
      {editingTransaction && (
          <EditTransactionModal
              transaction={editingTransaction}
              onClose={() => setEditingTransaction(null)}
              onSave={handleUpdate}
              settings={settings}
          />
      )}
      <ConfirmationModal
        isOpen={!!transactionToDelete}
        onClose={() => setTransactionToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
      />
      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Transaction Log</h2>
           <div className="flex items-center space-x-2 sm:space-x-4">
              <div>
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
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-10 pr-3 py-1.5 border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                 </div>
              </div>
              <div className="flex items-center">
                  <label htmlFor="sort" className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Sort by:</label>
                  <select
                      id="sort"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'recordDate' | 'transactionDate')}
                      className="pl-3 pr-8 py-1.5 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                      <option value="recordDate">Record Date</option>
                      <option value="transactionDate">Transaction Date</option>
                  </select>
              </div>
          </div>
        </div>

        {sortedTransactions.length > 0 ? (
            <div className="flow-root">
              <ul className="-mb-8">
                {sortedTransactions.map((transaction, transactionIdx) => {
                  // PRODUCTION consumes materials
                  const detailsToDisplay = (transaction.type === 'PRODUCTION' || transaction.type === 'OUT') && transaction.productId && transaction.cartonsShipped
                    ? calculateDeductions(transaction.productId, transaction.cartonsShipped, settings)
                    : transaction.details;

                  return (
                  <li key={transaction.id}>
                    <div className="relative pb-8">
                      {transactionIdx !== sortedTransactions.length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3 items-start">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-gray-100 dark:ring-gray-900 ${getBgClass(transaction.type)}`}>
                            {getIcon(transaction.type)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                          <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(transaction.date).toLocaleString()}
                                </p>
                                <p className="mt-2 font-medium text-gray-900 dark:text-white">{transaction.description}</p>
                              </div>
                              <span className={`flex-shrink-0 ml-4 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getBadgeClass(transaction.type)}`}>
                                  {getLabel(transaction.type)}
                              </span>
                          </div>
                          
                          {transaction.orderNumber && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Ref: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{transaction.orderNumber}</span>
                              </p>
                          )}
                          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                            {detailsToDisplay.map(detail => (
                              <li key={detail.itemId} className="flex justify-between">
                                <span>{detail.itemName}</span>
                                <span className={`font-mono ${detail.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {detail.quantity > 0 ? '+' : ''}
                                  {detail.quantity % 1 !== 0 ? detail.quantity.toFixed(4) : detail.quantity.toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                           <div className="mt-4 flex justify-end space-x-3">
                                <button onClick={() => setEditingTransaction(transaction)} className="text-xs font-medium text-brand-red hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Edit</button>
                                <button onClick={() => handleDeleteRequest(transaction.id)} className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                           </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )})}
              </ul>
            </div>
        ) : (
            <div className="text-center py-12">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                    {transactions.length > 0 ? 'No Results Found' : 'No transactions'}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {transactions.length > 0 
                        ? `Your search for "${searchQuery}" did not match any transactions.`
                        : 'Get started by adding stock or logging production.'}
                </p>
            </div>
        )}
      </div>
    </>
  );
};

export default TransactionLog;
