
import { useState, useEffect, useCallback } from 'react';
import { InventoryState, ProductState, Transaction, InventoryItemId, ProductId, TransactionDetail, AppSettings } from '../types';
import { INITIAL_INVENTORY_STATE, INITIAL_PRODUCT_STATE, INVENTORY_ITEMS, DEDUCTION_RULES, FINISHED_PRODUCTS } from '../constants';
import { calculateDeductions } from '../utils';

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const generateDefaultSettings = (): AppSettings => ({
    rejectionCoefficients: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: 0 }), {} as Record<InventoryItemId, number>),
    bypassedItems: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: false }), {} as Record<InventoryItemId, boolean>),
    stockThresholds: INVENTORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: { low: 5, ideal: 15 } }), {} as Record<InventoryItemId, { low: number, ideal: number }>),
    productFormulas: DEDUCTION_RULES,
    materialUsage: {
        masksPerRollMeltblown: 11428,
        masksPerRollBackLayer: 11428,
        masksPerRollOuterL1: 11428,
        masksPerRollOuterL2: 11428,
        masksPerRollOuterL3: 11428,
        masksPerRollNosewire: 15000,
        masksPerRollElastic: 6000,
    }
});

const mergeSettings = (loadedSettings: Partial<AppSettings> | any): AppSettings => {
    const defaultSettings = generateDefaultSettings();
    
    // Migration: Handle old settings format where fabricPerMask existed
    let mergedMaterialUsage = { ...defaultSettings.materialUsage };
    if (loadedSettings.materialUsage) {
        // If old key exists and new ones don't, migrate roughly
        if ('fabricPerMask' in loadedSettings.materialUsage && !('masksPerRollMeltblown' in loadedSettings.materialUsage)) {
             const oldFabricPerMask = loadedSettings.materialUsage.fabricPerMask;
             const calculated = oldFabricPerMask > 0 ? 2000 / oldFabricPerMask : 11428;
             mergedMaterialUsage = {
                 ...mergedMaterialUsage,
                 masksPerRollMeltblown: calculated,
                 masksPerRollBackLayer: calculated,
                 masksPerRollOuterL1: calculated,
                 masksPerRollOuterL2: calculated,
                 masksPerRollOuterL3: calculated,
                 masksPerRollNosewire: loadedSettings.materialUsage.masksPerRollNosewire || defaultSettings.materialUsage.masksPerRollNosewire,
                 masksPerRollElastic: loadedSettings.materialUsage.masksPerRollElastic || defaultSettings.materialUsage.masksPerRollElastic,
             };
        } else {
             mergedMaterialUsage = { ...mergedMaterialUsage, ...loadedSettings.materialUsage };
        }
    }

    return {
        ...defaultSettings,
        ...loadedSettings,
        rejectionCoefficients: { ...defaultSettings.rejectionCoefficients, ...loadedSettings.rejectionCoefficients },
        bypassedItems: { ...defaultSettings.bypassedItems, ...loadedSettings.bypassedItems },
        stockThresholds: { ...defaultSettings.stockThresholds, ...loadedSettings.stockThresholds },
        productFormulas: { ...defaultSettings.productFormulas, ...loadedSettings.productFormulas },
        materialUsage: mergedMaterialUsage,
    };
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useInventory = () => {
  // Inventory state is now derived from transactions, not stored directly.
  const [inventory, setInventory] = useState<InventoryState>(INITIAL_INVENTORY_STATE);
  const [productInventory, setProductInventory] = useState<ProductState>(INITIAL_PRODUCT_STATE);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('transactions');
      const loaded = saved ? JSON.parse(saved) : [];
      
      const uniqueIds = new Set();

      // Migration: Map legacy 'OUT' to 'PRODUCTION' and Deduplicate IDs
      return loaded.map((t: Transaction) => {
          let mapped = t.type === 'OUT' ? { ...t, type: 'PRODUCTION' } : t;
          
          // Fix: Ensure unique IDs for existing data to prevent bulk deletion
          if (uniqueIds.has(mapped.id)) {
              mapped = { ...mapped, id: mapped.id + '-dup-' + Math.random().toString(36).substr(2, 5) };
          }
          uniqueIds.add(mapped.id);
          return mapped;
      });
    } catch (error) { return []; }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
        const saved = localStorage.getItem('inventoryAppSettings');
        const loadedSettings = saved ? JSON.parse(saved) : {};
        return mergeSettings(loadedSettings);
    } catch (error) { return generateDefaultSettings(); }
  });

  // Core Logic: Recalculate both Raw Materials and Finished Goods from transactions
  useEffect(() => {
    const newInventory = { ...INITIAL_INVENTORY_STATE };
    const newProductInventory = { ...INITIAL_PRODUCT_STATE };

    // Transactions are stored newest-first, so we reverse to process them chronologically.
    [...transactions].reverse().forEach(tx => {
        if (tx.type === 'IN') {
            tx.details.forEach(detail => {
                newInventory[detail.itemId] = (newInventory[detail.itemId] || 0) + detail.quantity;
            });
        } else if (tx.type === 'PRODUCTION' && tx.productId && tx.cartonsShipped) {
            // 1. Deduct Raw Materials
            const deductions = calculateDeductions(tx.productId, tx.cartonsShipped, settings);
            deductions.forEach(detail => {
                newInventory[detail.itemId] = (newInventory[detail.itemId] || 0) + detail.quantity; // quantity is negative
            });
            // 2. Add Finished Good to Stock
            newProductInventory[tx.productId] = (newProductInventory[tx.productId] || 0) + tx.cartonsShipped;

        } else if (tx.type === 'SHIPMENT' && tx.productId && tx.cartonsShipped) {
            // 1. Deduct Finished Good from Stock
             newProductInventory[tx.productId] = (newProductInventory[tx.productId] || 0) - tx.cartonsShipped;
        }
    });
    setInventory(newInventory);
    setProductInventory(newProductInventory);
  }, [transactions, settings]);


  // Persist only the sources of truth to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem('transactions', JSON.stringify(transactions));
      localStorage.setItem('inventoryAppSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving state to localStorage', error);
    }
  }, [transactions, settings]);
  
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
      setSettings(prev => ({...prev, ...newSettings}));
  }, []);

  const addStock = useCallback((itemId: InventoryItemId, quantity: number, notes: string, orderNumber: string, date?: string) => {
    const item = ITEMS_MAP.get(itemId);
    if (!item) return;

    const newTransaction: Transaction = {
      id: generateId(),
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      type: 'IN',
      description: `Stock Received: ${item.name} ${notes ? `(${notes})` : ''}`,
      details: [{ itemId, itemName: item.name, quantity }],
      orderNumber: orderNumber || undefined,
    };

    setTransactions(prev => [newTransaction, ...prev]);
  }, []);

  const logProduction = useCallback((productId: ProductId, cartonsProduced: number, orderNumber: string, date?: string) => {
    const product = FINISHED_PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    const newTransaction: Transaction = {
      id: generateId(),
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      type: 'PRODUCTION',
      description: `Production: ${cartonsProduced} carton(s) of ${product.name}`,
      details: [], // Calculated dynamically
      orderNumber: orderNumber || undefined,
      productId: productId,
      cartonsShipped: cartonsProduced, 
    };

    setTransactions(prev => [newTransaction, ...prev]);
  }, []);

  const logShipment = useCallback((productId: ProductId, cartonsShipped: number, orderNumber: string, date?: string) => {
      const product = FINISHED_PRODUCTS.find(p => p.id === productId);
      if (!product) return;

      const newTransaction: Transaction = {
          id: generateId(),
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          type: 'SHIPMENT',
          description: `Shipment: ${cartonsShipped} carton(s) of ${product.name} to ${product.customer}`,
          details: [], 
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
    
    // For raw inserts (e.g. splitting transactions)
    const addTransaction = useCallback((transaction: Transaction) => {
        setTransactions(prev => [transaction, ...prev]);
    }, []);

  const exportData = useCallback(() => {
    // Ensure export does not contain calculated details for PRODUCTION or SHIPMENT, only metadata.
    const cleanTransactions = transactions.map(t => {
        if (t.type === 'PRODUCTION' || t.type === 'OUT' || t.type === 'SHIPMENT') {
            return { ...t, details: [] };
        }
        return t;
    });

    const data = {
      transactions: cleanTransactions,
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
            if (data.transactions) {
                const uniqueIds = new Set();
                const migratedTransactions = data.transactions.map((t: Transaction) => {
                    let mapped = t.type === 'OUT' ? { ...t, type: 'PRODUCTION' } : t;
                     if (uniqueIds.has(mapped.id)) {
                        mapped = { ...mapped, id: mapped.id + '-dup-' + Math.random().toString(36).substr(2, 5) };
                    }
                    uniqueIds.add(mapped.id);
                    return mapped;
                });
                setTransactions(migratedTransactions);
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

  return { inventory, productInventory, transactions, settings, updateSettings, addStock, logProduction, logShipment, exportData, importData, deleteTransaction, updateTransaction, addTransaction };
};
