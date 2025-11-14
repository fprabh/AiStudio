import { useState, useEffect, useCallback } from 'react';
import { InventoryState, Transaction, InventoryItemId, ProductId, TransactionDetail, AppSettings } from '../types';
import { INITIAL_INVENTORY_STATE, INVENTORY_ITEMS, DEDUCTION_RULES, FINISHED_PRODUCTS } from '../constants';
import { calculateDeductions } from '../utils';

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const generateDefaultSettings = (): AppSettings => ({
    rejectionCoefficients: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: 0 }), {} as Record<InventoryItemId, number>),
    bypassedItems: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: false }), {} as Record<InventoryItemId, boolean>),
    stockThresholds: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: { low: 5, ideal: 15 } }), {} as Record<InventoryItemId, { low: number, ideal: number }>),
    productFormulas: DEDUCTION_RULES,
    materialUsage: {
        fabricPerMask: 0.175,
        nosewirePerMask: 0.0105,
        elasticPerMask: 0.210,
    }
});

const mergeSettings = (loadedSettings: Partial<AppSettings>): AppSettings => {
    const defaultSettings = generateDefaultSettings();
    return {
        ...defaultSettings,
        ...loadedSettings,
        rejectionCoefficients: { ...defaultSettings.rejectionCoefficients, ...loadedSettings.rejectionCoefficients },
        bypassedItems: { ...defaultSettings.bypassedItems, ...loadedSettings.bypassedItems },
        stockThresholds: { ...defaultSettings.stockThresholds, ...loadedSettings.stockThresholds },
        productFormulas: { ...defaultSettings.productFormulas, ...loadedSettings.productFormulas },
        materialUsage: { ...defaultSettings.materialUsage, ...loadedSettings.materialUsage },
    };
}


export const useInventory = () => {
  // Inventory state is now derived from transactions, not stored directly.
  const [inventory, setInventory] = useState<InventoryState>(INITIAL_INVENTORY_STATE);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (error) { return []; }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
        const saved = localStorage.getItem('inventoryAppSettings');
        const loadedSettings = saved ? JSON.parse(saved) : {};
        return mergeSettings(loadedSettings);
    } catch (error) { return generateDefaultSettings(); }
  });

  // This is the new core logic: Recalculate inventory from the single source of truth (transactions) and current settings.
  useEffect(() => {
    const newInventory = { ...INITIAL_INVENTORY_STATE };
    // Transactions are stored newest-first, so we reverse to process them chronologically.
    [...transactions].reverse().forEach(tx => {
        if (tx.type === 'IN') {
            tx.details.forEach(detail => {
                newInventory[detail.itemId] = (newInventory[detail.itemId] || 0) + detail.quantity;
            });
        } else if (tx.type === 'OUT' && tx.productId && tx.cartonsShipped) {
            const deductions = calculateDeductions(tx.productId, tx.cartonsShipped, settings);
            deductions.forEach(detail => {
                newInventory[detail.itemId] = (newInventory[detail.itemId] || 0) + detail.quantity; // quantity is already negative
            });
        }
    });
    setInventory(newInventory);
  }, [transactions, settings]);


  // Persist only the sources of truth to localStorage.
  useEffect(() => {
    try {
      // Inventory state is no longer persisted as it's a derived value.
      localStorage.setItem('transactions', JSON.stringify(transactions));
      localStorage.setItem('inventoryAppSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving state to localStorage', error);
    }
  }, [transactions, settings]);
  
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
      setSettings(prev => ({...prev, ...newSettings}));
  }, []);

  // All functions below now only modify the transactions array. The useEffect handles inventory recalculation.
  const addStock = useCallback((itemId: InventoryItemId, quantity: number, notes: string, orderNumber: string, date?: string) => {
    const item = ITEMS_MAP.get(itemId);
    if (!item) return;

    const newTransaction: Transaction = {
      id: new Date().toISOString() + Math.random(),
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      type: 'IN',
      description: `Stock Received: ${item.name} ${notes ? `(${notes})` : ''}`,
      details: [{ itemId, itemName: item.name, quantity }],
      orderNumber: orderNumber || undefined,
    };

    setTransactions(prev => [newTransaction, ...prev]);
  }, []);

  const logShipment = useCallback((productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string) => {
    const product = FINISHED_PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    const newTransaction: Transaction = {
      id: new Date().toISOString() + Math.random(),
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      type: 'OUT',
      description: `Shipment: ${cartonsShipped} carton(s) of ${product.name} to ${product.customer}`,
      details: [], // OUT transactions no longer store calculated details
      orderNumber: orderNumber || undefined,
      productId: productId,
      cartonsShipped: cartonsShipped,
    };

    setTransactions(prev => [newTransaction, ...prev]);
  }, []);
    
    const deleteTransaction = useCallback((transactionId: string) => {
        setTransactions(prev => prev.filter(t => t.id !== transactionId));
    }, []);

    const updateTransaction = useCallback((updatedTx: Transaction) => {
        setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
    }, []);

  const exportData = useCallback(() => {
    // Export only the sources of truth.
    const data = {
      transactions,
      settings,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const link = document.createElement('a');
    link.href = jsonString;
    const date = new Date().toISOString().slice(0, 10);
    link.download = `inventory-backup-${date}.json`;
    link.click();
  }, [transactions, settings]);

  const importData = useCallback((jsonData: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        try {
            const data = JSON.parse(jsonData);
            // We only need to restore transactions and settings. Inventory will be derived.
            if (data.transactions) {
                setTransactions(data.transactions);
                setSettings(mergeSettings(data.settings || {}));
                resolve();
            } else {
                reject(new Error('Invalid backup file. The "transactions" data is missing.'));
            }
        } catch (error) {
            reject(new Error('Failed to parse the backup file. It may be corrupt.'));
        }
    });
  }, []);

  return { inventory, transactions, settings, updateSettings, addStock, logShipment, exportData, importData, deleteTransaction, updateTransaction };
};
