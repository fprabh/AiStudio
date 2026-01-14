
import React, { useState } from 'react';
import { InventoryItemId } from '../types';
import { INVENTORY_ITEMS } from '../constants';

interface ScrapModalProps {
    onClose: () => void;
    onSave: (itemId: InventoryItemId, quantity: number, reason: string, date: string) => void;
    initialItemId?: InventoryItemId;
}

const ScrapModal: React.FC<ScrapModalProps> = ({ onClose, onSave, initialItemId }) => {
    const [itemId, setItemId] = useState<InventoryItemId | ''>(initialItemId || '');
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (itemId && quantity && reason && date) {
            onSave(itemId, parseFloat(quantity), reason, date);
            onClose();
        }
    };

    const selectedItem = INVENTORY_ITEMS.find(i => i.id === itemId);

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Scrap Inventory</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Inventory Item</label>
                            <select
                                value={itemId}
                                onChange={e => setItemId(e.target.value as InventoryItemId)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                required
                                disabled={!!initialItemId}
                            >
                                <option value="" disabled>Select an item</option>
                                {INVENTORY_ITEMS.map(item => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Quantity to Scrap</label>
                            <div className="relative mt-1 rounded-md shadow-sm">
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    step="any"
                                    min="0.0001"
                                    className="block w-full pl-3 pr-12 py-2 border-gray-300 focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    placeholder="0.00"
                                    required
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">
                                        {selectedItem?.unit || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-3 py-2 border-gray-300 focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                placeholder="e.g., Damaged, Expired, Test Run"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-3 py-2 border-gray-300 focus:ring-brand-red focus:border-brand-red sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                required
                            />
                        </div>
                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 dark:border-gray-500"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                                Confirm Scrap
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ScrapModal;
