
import React, { useState } from 'react';
import { InventoryItemId, View } from '../types';
import { INVENTORY_ITEMS } from '../constants';

interface AddStockFormProps {
  addStock: (itemId: InventoryItemId, quantity: number, notes: string, orderNumber: string, date?: string) => void;
  setView: (view: View) => void;
}

const AddStockForm: React.FC<AddStockFormProps> = ({ addStock, setView }) => {
  const [itemId, setItemId] = useState<InventoryItemId | ''>('');
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (itemId && quantity && parseFloat(quantity) > 0 && date) {
      addStock(itemId, parseFloat(quantity), notes, orderNumber, date);
      setView('transactions');
    } else {
      alert('Please fill in all required fields with valid values.');
    }
  };
  
  const selectedItem = INVENTORY_ITEMS.find(i => i.id === itemId);

  return (
    <div className="max-w-xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Add Incoming Stock</h2>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div>
                <label htmlFor="item" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Item</label>
                <select
                    id="item"
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value as InventoryItemId)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    required
                >
                    <option value="" disabled>Select an item</option>
                    {INVENTORY_ITEMS.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Quantity {selectedItem && `(${selectedItem.unit})`}
                    </label>
                    <input
                        type="number"
                        id="quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        step="any"
                        min="0.0001"
                        className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date Received</label>
                    <input
                        type="date"
                        id="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                        required
                    />
                </div>
            </div>
             <div>
                <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Order/Reference Number (Optional)</label>
                <input
                    type="text"
                    id="orderNumber"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    placeholder="e.g., PO-12345"
                />
            </div>
            <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes (Optional)</label>
                <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                />
            </div>
            <div className="flex justify-end space-x-4">
                 <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
                    Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700">
                    Add Stock
                </button>
            </div>
        </form>
    </div>
  );
};

export default AddStockForm;