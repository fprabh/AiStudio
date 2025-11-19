
import { TransactionDetail, ProductId, InventoryItemId, AppSettings } from './types';
import { FINISHED_PRODUCTS, INVENTORY_ITEMS } from './constants';

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

const getMasksPerRoll = (itemId: InventoryItemId, settings: AppSettings): number => {
    if (itemId === 'meltblownFabric') return settings.materialUsage.masksPerRollMeltblown;
    if (itemId === 'backLayerFabric') return settings.materialUsage.masksPerRollBackLayer;
    if (itemId.startsWith('outerLayerL1')) return settings.materialUsage.masksPerRollOuterL1;
    if (itemId.startsWith('outerLayerL2')) return settings.materialUsage.masksPerRollOuterL2;
    if (itemId.startsWith('outerLayerL3')) return settings.materialUsage.masksPerRollOuterL3;
    if (itemId === 'nosewire') return settings.materialUsage.masksPerRollNosewire;
    if (itemId === 'elastic') return settings.materialUsage.masksPerRollElastic;
    return 1; // Should not happen for valid roll-based items
};

export const calculateDeductions = (productId: ProductId, cartonsShipped: number, settings: AppSettings): TransactionDetail[] => {
    const product = FINISHED_PRODUCTS.find(p => p.id === productId);
    const rule = settings.productFormulas[productId];
    if (!product || !rule || !cartonsShipped || cartonsShipped <= 0) return [];

    const totalMasks = cartonsShipped * rule.boxesPerCarton * rule.masksPerBox;
    const deductions: Record<InventoryItemId, number> = {} as Record<InventoryItemId, number>;
    
    // Raw Materials
    const rawMaterialItems = Object.values(rule.rawMaterials);
    for(const unknownItemId of rawMaterialItems) {
        const itemId = unknownItemId as InventoryItemId;
        if(settings.bypassedItems[itemId]) continue;
        
        let quantity = 0;
        const itemInfo = ITEMS_MAP.get(itemId);
        if(itemInfo?.unit === 'rolls') {
            const masksPerRoll = getMasksPerRoll(itemId, settings);
            quantity = totalMasks / masksPerRoll;
        } 
        
        const rejectionRate = settings.rejectionCoefficients[itemId] || 0;
        const adjustedQuantity = quantity * (1 + rejectionRate / 100);
        deductions[itemId] = (deductions[itemId] || 0) + adjustedQuantity;
    }
    
    // Packaging Materials
    const packagingItems = Object.values(rule.packaging);
     for(const unknownItemId of packagingItems) {
        const itemId = unknownItemId as InventoryItemId;
        if(settings.bypassedItems[itemId]) continue;
        let quantity = itemId === rule.packaging.box ? cartonsShipped * rule.boxesPerCarton : cartonsShipped;
        
        const rejectionRate = settings.rejectionCoefficients[itemId] || 0;
        const adjustedQuantity = quantity * (1 + rejectionRate / 100);
        deductions[itemId] = (deductions[itemId] || 0) + adjustedQuantity;
     }
    
    return Object.entries(deductions).map(([itemId, quantity]) => ({
      itemId: itemId as InventoryItemId,
      itemName: ITEMS_MAP.get(itemId as InventoryItemId)?.name || 'Unknown Item',
      quantity: -quantity,
    }));
};
