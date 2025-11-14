import { TransactionDetail, ProductId, InventoryItemId, AppSettings } from './types';
import { FINISHED_PRODUCTS, INVENTORY_ITEMS, METERS_PER_ROLL } from './constants';

const ITEMS_MAP = new Map(INVENTORY_ITEMS.map(item => [item.id, item]));

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
            const fabricMetersUsed = totalMasks * settings.materialUsage.fabricPerMask;
            quantity = fabricMetersUsed / METERS_PER_ROLL;
        } else if(itemId === 'nosewire') {
            quantity = totalMasks * settings.materialUsage.nosewirePerMask;
        } else if(itemId === 'elastic') {
            quantity = totalMasks * settings.materialUsage.elasticPerMask;
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
