
import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { FINISHED_PRODUCTS } from '../constants';
import { useInventory } from '../hooks/useInventory';

interface LotHistoryProps {
  transactions: Transaction[];
  settings: ReturnType<typeof useInventory>['settings'];
  updateTransaction: ReturnType<typeof useInventory>['updateTransaction'];
}

const LotHistory: React.FC<LotHistoryProps> = ({ transactions, settings, updateTransaction }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({}); // Map transactionId -> newOrderNumber

  const history = useMemo(() => {
      return transactions
        .filter(t => (t.type === 'PRODUCTION' || t.type === 'OUT') && t.productId)
        .map(t => {
            const product = FINISHED_PRODUCTS.find(p => p.id === t.productId);
            return {
                ...t,
                productName: product ? product.name : 'Unknown',
                customer: product ? product.customer : '-',
            };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const handleInputChange = (id: string, value: string) => {
      setEdits(prev => ({...prev, [id]: value}));
  };

  const saveChanges = () => {
      Object.entries(edits).forEach(([id, value]) => {
          const originalTx = transactions.find(t => t.id === id);
          if (originalTx && originalTx.orderNumber !== value) {
             updateTransaction({ ...originalTx, orderNumber: value });
          }
      });
      setIsEditMode(false);
      setEdits({});
  };
  
  const cancelEdit = () => {
      setIsEditMode(false);
      setEdits({});
  };

  return (
    <div className="space-y-8">
      
      {/* Current Status Cards */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Current Lot Sequences</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {Object.entries(settings.lotSequences).map(([level, seq]) => (
                 <div key={level} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4 border-brand-red">
                     <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wider">{level} Sequence</h3>
                     <div className="mt-2 flex items-baseline">
                         <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{seq}</span>
                         <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Next Available</span>
                     </div>
                     <p className="mt-2 text-xs text-gray-400">
                        Format: {level} - XXXXX
                     </p>
                 </div>
             ))}
        </div>
      </div>

      {/* History Table */}
      <div>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Lot Production Log</h2>
            <div className="space-x-3">
                {!isEditMode ? (
                    <button 
                        onClick={() => setIsEditMode(true)}
                        className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm"
                    >
                        Edit Lots
                    </button>
                ) : (
                    <>
                        <button 
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={saveChanges}
                            className="px-4 py-2 bg-brand-red text-white rounded-md shadow-sm hover:bg-red-700 font-medium text-sm"
                        >
                            Save Changes
                        </button>
                    </>
                )}
            </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Generated Lot Number(s)</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Product</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Customer</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Cartons</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {history.length > 0 ? (
                        history.map((t) => {
                            const currentValue = edits[t.id] !== undefined ? edits[t.id] : (t.orderNumber || '');
                            return (
                                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 align-top">
                                        {new Date(t.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-mono align-top min-w-[300px]">
                                        {isEditMode ? (
                                            <textarea
                                                value={currentValue}
                                                onChange={(e) => handleInputChange(t.id, e.target.value)}
                                                className="w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md shadow-sm focus:ring-brand-red focus:border-brand-red text-sm font-mono"
                                                rows={Math.max(2, currentValue.split(',').length)}
                                            />
                                        ) : (
                                            t.orderNumber ? (
                                                <div className="flex flex-col space-y-1">
                                                    {t.orderNumber.split(',').map((part, idx) => (
                                                        <span key={idx} className="inline-block bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 break-words">
                                                            {part.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic">-</span>
                                            )
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white align-top">
                                        {t.productName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 align-top">
                                        {t.customer}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-bold font-mono align-top">
                                        {t.cartonsShipped?.toLocaleString()}
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                                No production lots found in history.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LotHistory;
