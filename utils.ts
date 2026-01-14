
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

export const calculateDeductions = (productId: ProductId, cartonsShipped: number, settings: AppSettings, extraRejection: number = 0): TransactionDetail[] => {
    const product = FINISHED_PRODUCTS.find(p => p.id === productId);
    const rule = settings.productFormulas[productId];
    if (!product || !rule || !cartonsShipped || cartonsShipped <= 0) return [];

    const totalMasks = cartonsShipped * rule.boxesPerCarton * rule.masksPerBox;
    const deductions: Record<InventoryItemId, number> = {} as Record<InventoryItemId, number>;
    
    // Raw Materials
    const rawMaterialItems = Object.values(rule.rawMaterials);
    for(const unknownItemId of rawMaterialItems) {
        const itemId = unknownItemId as InventoryItemId;
        
        let quantity = 0;
        const itemInfo = ITEMS_MAP.get(itemId);
        if(itemInfo?.unit === 'rolls') {
            const masksPerRoll = getMasksPerRoll(itemId, settings);
            quantity = totalMasks / masksPerRoll;

            // FIX: Elastic requires 2 rolls (Left/Right) per mask production run
            if (itemId === 'elastic') {
                quantity *= 2;
            }
        } 
        
        const rejectionRate = settings.rejectionCoefficients[itemId] || 0;
        // Apply extra rejection (additively) to raw materials
        const adjustedQuantity = quantity * (1 + (rejectionRate + extraRejection) / 100);
        deductions[itemId] = (deductions[itemId] || 0) + adjustedQuantity;
    }
    
    // Packaging Materials
    const packagingItems = Object.values(rule.packaging);
     for(const unknownItemId of packagingItems) {
        const itemId = unknownItemId as InventoryItemId;

        let quantity = itemId === rule.packaging.box ? cartonsShipped * rule.boxesPerCarton : cartonsShipped;
        
        const rejectionRate = settings.rejectionCoefficients[itemId] || 0;
        // Extra rejection does NOT apply to packaging
        const adjustedQuantity = quantity * (1 + rejectionRate / 100);
        deductions[itemId] = (deductions[itemId] || 0) + adjustedQuantity;
     }
    
    return Object.entries(deductions).map(([itemId, quantity]) => ({
      itemId: itemId as InventoryItemId,
      itemName: ITEMS_MAP.get(itemId as InventoryItemId)?.name || 'Unknown Item',
      quantity: -quantity,
    }));
};

export const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                // Compress to JPEG with 0.7 quality
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};
