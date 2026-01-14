
import React, { useState, useCallback } from 'react';
import { useInventory } from './hooks/useInventory';
import { View, NavigationType, InventoryItemId } from './types';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import TransactionLog from './components/TransactionLog';
import Shipments from './components/Shipments';
import ProductionHistory from './components/ProductionHistory';
import StockHistory from './components/StockHistory';
import AddStockForm from './components/AddStockForm';
import LogProductionForm from './components/LogProductionForm';
import LogShipmentForm from './components/LogShipmentForm';
import Settings from './components/Settings';
import LotHistory from './components/LotHistory';
import ScrapModal from './components/ScrapModal';
import { useTheme } from './hooks/useTheme';

const App: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const inventoryData = useInventory();
  const [theme, toggleTheme] = useTheme();

  // Navigation Context State
  const [navLotSearch, setNavLotSearch] = useState('');
  const [navStockId, setNavStockId] = useState('');
  const [navItemId, setNavItemId] = useState('');
  const [navShipmentPO, setNavShipmentPO] = useState('');

  const handleNavigate = useCallback((type: NavigationType, value: string) => {
      // Reset contexts
      setNavLotSearch('');
      setNavStockId('');
      setNavItemId('');
      setNavShipmentPO('');

      switch(type) {
          case 'lot':
              setNavLotSearch(value);
              setView('lotHistory');
              break;
          case 'stock':
              setNavStockId(value);
              setView('stockHistory');
              break;
          case 'inventory':
              setNavItemId(value);
              setView('inventory');
              break;
          case 'shipment':
              setNavShipmentPO(value);
              setView('shipments');
              break;
      }
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard 
                  inventory={inventoryData.inventory} 
                  productInventory={inventoryData.productInventory} 
                  transactions={inventoryData.transactions}
                  setView={setView} 
                  settings={inventoryData.settings} 
                  onNavigate={handleNavigate}
                />;
      case 'inventory':
        return <InventoryList 
                  inventory={inventoryData.inventory} 
                  settings={inventoryData.settings} 
                  transactions={inventoryData.transactions}
                  logScrap={inventoryData.logScrap}
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  highlightItemId={navItemId as InventoryItemId}
                  onNavigate={handleNavigate}
                />;
      case 'transactions':
        return <TransactionLog 
                  transactions={inventoryData.transactions}
                  settings={inventoryData.settings}
                  onNavigate={handleNavigate}
                />;
      case 'shipments':
        return <Shipments 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  productInventory={inventoryData.productInventory}
                  lotState={inventoryData.lotState}
                  initialSearchTerm={navShipmentPO}
                  onNavigate={handleNavigate}
               />;
      case 'productionHistory':
        return <ProductionHistory 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  inventory={inventoryData.inventory}
                  onNavigate={handleNavigate}
               />;
      case 'stockHistory':
        return <StockHistory 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  inventory={inventoryData.inventory}
                  initialStockId={navStockId}
                  onNavigate={handleNavigate}
               />;
      case 'lotHistory':
        return <LotHistory 
                  transactions={inventoryData.transactions} 
                  settings={inventoryData.settings}
                  lotMetadata={inventoryData.lotMetadata}
                  updateLotMetadata={inventoryData.updateLotMetadata}
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  inventory={inventoryData.inventory}
                  initialSearchTerm={navLotSearch}
                  onNavigate={handleNavigate}
               />;
      case 'addStock':
        return <AddStockForm 
                  addStock={inventoryData.addStock} 
                  setView={setView} 
                  inventory={inventoryData.inventory}
                  transactions={inventoryData.transactions}
                  settings={inventoryData.settings}
               />;
      case 'logProduction':
        return <LogProductionForm 
                  logProduction={inventoryData.logProduction} 
                  setView={setView} 
                  inventory={inventoryData.inventory} 
                  productInventory={inventoryData.productInventory}
                  settings={inventoryData.settings}
                  updateSettings={inventoryData.updateSettings}
               />;
      case 'logShipment':
        return <LogShipmentForm 
                logShipment={inventoryData.logShipment}
                logBatchShipments={inventoryData.logBatchShipments}
                setView={setView} 
                inventory={inventoryData.productInventory} 
                settings={inventoryData.settings}
                transactions={inventoryData.transactions}
                lotState={inventoryData.lotState}
            />;
      case 'settings':
        return (
            <SettingsWrapper 
                inventoryData={inventoryData}
            />
        );
      default:
        return <Dashboard inventory={inventoryData.inventory} productInventory={inventoryData.productInventory} transactions={inventoryData.transactions} setView={setView} settings={inventoryData.settings} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen text-brand-dark dark:text-gray-200">
      <Header setView={setView} currentView={view} theme={theme} toggleTheme={toggleTheme} />
      <main className="p-4 sm:p-6 lg:p-8">
        {renderView()}
      </main>
    </div>
  );
};

// Wrapper to inject logScrap into Settings which has internal Modal state
const SettingsWrapper = ({ inventoryData }: { inventoryData: any }) => {
    return (
        <>
            <div className="relative">
                <Settings 
                    settings={inventoryData.settings} 
                    updateSettings={inventoryData.updateSettings}
                    exportData={inventoryData.exportData}
                    importData={inventoryData.importData}
                />
            </div>
        </>
    )
}

export default App;
