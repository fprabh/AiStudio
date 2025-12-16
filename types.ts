
export type InventoryItemId = 
  | 'meltblownFabric' | 'backLayerFabric' | 'outerLayerL1White' | 'outerLayerL1Blue' 
  | 'outerLayerL2Yellow' | 'outerLayerL2Blue' | 'outerLayerL3Pink' | 'outerLayerL3Blue'
  | 'nosewire' | 'elastic' | 'phsaMaskBox' | 'padmMaskBox' | 'sharedMasterCarton'
  | 'allianceL1WhiteBox' | 'allianceL1WhiteCarton' | 'allianceL1BlueBox' | 'allianceL1BlueCarton'
  | 'allianceL2YellowBox' | 'allianceL2YellowCarton' | 'allianceL2BlueBox' | 'allianceL2BlueCarton'
  | 'allianceL3PinkBox' | 'allianceL3PinkCarton' | 'allianceL3BlueBox' | 'allianceL3BlueCarton';

export type Unit = 'rolls' | 'meters' | 'items';
export type Category = 'Raw Materials' | 'Packaging Materials';
export type Customer = 'PHSA' | 'PADM' | 'Alliance';
export type View = 'dashboard' | 'inventory' | 'transactions' | 'shipments' | 'productionHistory' | 'stockHistory' | 'addStock' | 'logProduction' | 'logShipment' | 'settings' | 'lotHistory';
export type LotLevel = 'LV1' | 'LV2' | 'LV3';

export type NavigationType = 'lot' | 'stock' | 'inventory' | 'shipment';
export type OnNavigate = (type: NavigationType, value: string) => void;

export interface InventoryItem {
  id: InventoryItemId;
  name: string;
  unit: Unit;
  category: Category;
  subCategory: string;
}

export type InventoryState = Record<InventoryItemId, number>;
export type ProductState = Record<ProductId, number>;
export type LotState = Record<string, number>; // LotNumber -> Remaining Cartons

export interface LotMetadata {
    startDate?: string;
    endDate?: string;
    notes?: string;
}

export type TransactionType = 'IN' | 'OUT' | 'PRODUCTION' | 'SHIPMENT'; // Keeping OUT for legacy parsing safely

export interface TransactionDetail {
  itemId: InventoryItemId;
  itemName: string;
  quantity: number;
  stockId?: string; // The specific batch/roll identifier
  notes?: string; // Line-item specific notes
}

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  details: TransactionDetail[];
  orderNumber?: string; // For IN -> Vendor PO, For PROD -> Lot #, For SHIP -> Customer PO
  // For PRODUCTION and SHIPMENT
  productId?: ProductId;
  cartonsShipped?: number; // Used for both produced count and shipped count
  // For SHIPMENT - Track which lots were used
  lotAllocations?: Record<string, number>; // LotNumber -> Quantity Used
  // For PRODUCTION - Track which Raw Material Stock IDs were used
  materialLinkage?: Partial<Record<InventoryItemId, string[]>>; // ItemId -> Array of StockIDs
  // Photo Proof
  photos?: string[]; // Array of Base64 strings
}

export type ProductId = 
  | 'phsaL3Blue' | 'padmL3Blue' | 'allianceL1White' | 'allianceL1Blue'
  | 'allianceL2Yellow' | 'allianceL2Blue' | 'allianceL3Pink' | 'allianceL3Blue';

export interface Product {
  id: ProductId;
  name: string;
  customer: Customer;
}

export interface DeductionRule {
  boxesPerCarton: number;
  masksPerBox: number;
  cartonsPerPallet: number; 
  rawMaterials: {
    meltblown: InventoryItemId;
    backLayer: InventoryItemId;
    outerLayer: InventoryItemId;
    nosewire: InventoryItemId;
    elastic: InventoryItemId;
  };
  packaging: {
    box: InventoryItemId;
    carton: InventoryItemId;
  };
}

export interface AppSettings {
    rejectionCoefficients: Record<InventoryItemId, number>;
    stockThresholds: Record<InventoryItemId, { low: number; ideal: number }>;
    productFormulas: Record<ProductId, DeductionRule>;
    lotSequences: Record<LotLevel, number>;
    lotSizeMaskBoxes: number; // Default 10080
    materialUsage: {
        masksPerRollMeltblown: number;
        masksPerRollBackLayer: number;
        masksPerRollOuterL1: number;
        masksPerRollOuterL2: number;
        masksPerRollOuterL3: number;
        masksPerRollNosewire: number;
        masksPerRollElastic: number;
    };
}
