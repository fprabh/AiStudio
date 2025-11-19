
import { InventoryItem, Product, ProductId, DeductionRule, InventoryState, ProductState } from './types';

export const INVENTORY_ITEMS: InventoryItem[] = [
  // Raw Materials
  { id: 'meltblownFabric', name: 'Meltblown Fabric', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'backLayerFabric', name: 'Back Layer Fabric', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL1White', name: 'Outer Layer - L1 White', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL1Blue', name: 'Outer Layer - L1 Blue', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL2Yellow', name: 'Outer Layer - L2 Yellow', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL2Blue', name: 'Outer Layer - L2 Blue', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL3Pink', name: 'Outer Layer - L3 Pink', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'outerLayerL3Blue', name: 'Outer Layer - L3 Blue', unit: 'rolls', category: 'Raw Materials', subCategory: 'Fabrics' },
  { id: 'nosewire', name: 'Nosewire', unit: 'rolls', category: 'Raw Materials', subCategory: 'Components' },
  { id: 'elastic', name: 'Elastic', unit: 'rolls', category: 'Raw Materials', subCategory: 'Components' },
  // Packaging Materials
  { id: 'phsaMaskBox', name: 'PHSA Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'padmMaskBox', name: 'PADM Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'sharedMasterCarton', name: 'Shared PHSA/PADM Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL1WhiteBox', name: 'Alliance L1 White Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL1WhiteCarton', name: 'Alliance L1 White Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL1BlueBox', name: 'Alliance L1 Blue Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL1BlueCarton', name: 'Alliance L1 Blue Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL2YellowBox', name: 'Alliance L2 Yellow Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL2YellowCarton', name: 'Alliance L2 Yellow Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL2BlueBox', name: 'Alliance L2 Blue Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL2BlueCarton', name: 'Alliance L2 Blue Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL3PinkBox', name: 'Alliance L3 Pink Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL3PinkCarton', name: 'Alliance L3 Pink Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
  { id: 'allianceL3BlueBox', name: 'Alliance L3 Blue Mask Box', unit: 'items', category: 'Packaging Materials', subCategory: 'Boxes' },
  { id: 'allianceL3BlueCarton', name: 'Alliance L3 Blue Master Carton', unit: 'items', category: 'Packaging Materials', subCategory: 'Cartons' },
];

export const FINISHED_PRODUCTS: Product[] = [
  { id: 'phsaL3Blue', name: 'PHSA Level 3 Blue', customer: 'PHSA' },
  { id: 'padmL3Blue', name: 'PADM Level 3 Blue', customer: 'PADM' },
  { id: 'allianceL1White', name: 'Alliance Level 1 White', customer: 'Alliance' },
  { id: 'allianceL1Blue', name: 'Alliance Level 1 Blue', customer: 'Alliance' },
  { id: 'allianceL2Yellow', name: 'Alliance Level 2 Yellow', customer: 'Alliance' },
  { id: 'allianceL2Blue', name: 'Alliance Level 2 Blue', customer: 'Alliance' },
  { id: 'allianceL3Pink', name: 'Alliance Level 3 Pink', customer: 'Alliance' },
  { id: 'allianceL3Blue', name: 'Alliance Level 3 Blue', customer: 'Alliance' },
];

export const METERS_PER_ROLL = 2000;

export const DEDUCTION_RULES: Record<ProductId, DeductionRule> = {
  phsaL3Blue: {
    boxesPerCarton: 20, masksPerBox: 50, cartonsPerPallet: 36,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL3Blue', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'phsaMaskBox', carton: 'sharedMasterCarton' },
  },
  padmL3Blue: {
    boxesPerCarton: 20, masksPerBox: 50, cartonsPerPallet: 36,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL3Blue', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'padmMaskBox', carton: 'sharedMasterCarton' },
  },
  allianceL1White: {
    boxesPerCarton: 6, masksPerBox: 50, cartonsPerPallet: 48,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL1White', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL1WhiteBox', carton: 'allianceL1WhiteCarton' },
  },
  allianceL1Blue: {
    boxesPerCarton: 6, masksPerBox: 50, cartonsPerPallet: 48,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL1Blue', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL1BlueBox', carton: 'allianceL1BlueCarton' },
  },
  allianceL2Yellow: {
    boxesPerCarton: 12, masksPerBox: 50, cartonsPerPallet: 36,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL2Yellow', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL2YellowBox', carton: 'allianceL2YellowCarton' },
  },
  allianceL2Blue: {
    boxesPerCarton: 12, masksPerBox: 50, cartonsPerPallet: 36,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL2Blue', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL2BlueBox', carton: 'allianceL2BlueCarton' },
  },
  allianceL3Pink: {
    boxesPerCarton: 10, masksPerBox: 50, cartonsPerPallet: 30,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL3Pink', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL3PinkBox', carton: 'allianceL3PinkCarton' },
  },
  allianceL3Blue: {
    boxesPerCarton: 10, masksPerBox: 50, cartonsPerPallet: 30,
    rawMaterials: { meltblown: 'meltblownFabric', backLayer: 'backLayerFabric', outerLayer: 'outerLayerL3Blue', nosewire: 'nosewire', elastic: 'elastic' },
    packaging: { box: 'allianceL3BlueBox', carton: 'allianceL3BlueCarton' },
  },
};

export const INITIAL_INVENTORY_STATE: InventoryState = INVENTORY_ITEMS.reduce((acc, item) => {
  acc[item.id] = 0;
  return acc;
}, {} as InventoryState);

export const INITIAL_PRODUCT_STATE: ProductState = FINISHED_PRODUCTS.reduce((acc, item) => {
    acc[item.id] = 0;
    return acc;
}, {} as ProductState);
