
import React, { useState } from 'react';
import { useInventory } from './hooks/useInventory';
import { View } from './types';
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
import { useTheme } from './hooks/useTheme';

const App: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const inventoryData = useInventory();
  const [theme, toggleTheme] = useTheme();

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard inventory={inventoryData.inventory} productInventory={inventoryData.productInventory} setView={setView} settings={inventoryData.settings} />;
      case 'inventory':
        return <InventoryList inventory={inventoryData.inventory} settings={inventoryData.settings} />;
      case 'transactions':
        return <TransactionLog 
                  transactions={inventoryData.transactions}
                  settings={inventoryData.settings}
                />;
      case 'shipments':
        return <Shipments 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  productInventory={inventoryData.productInventory}
                  lotState={inventoryData.lotState}
               />;
      case 'productionHistory':
        return <ProductionHistory 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  inventory={inventoryData.inventory}
               />;
      case 'stockHistory':
        return <StockHistory 
                  transactions={inventoryData.transactions} 
                  updateTransaction={inventoryData.updateTransaction}
                  deleteTransaction={inventoryData.deleteTransaction}
                  settings={inventoryData.settings}
                  inventory={inventoryData.inventory}
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
        return <Settings 
          settings={inventoryData.settings} 
          updateSettings={inventoryData.updateSettings}
          exportData={inventoryData.exportData}
          importData={inventoryData.importData}
        />;
      default:
        return <Dashboard inventory={inventoryData.inventory} productInventory={inventoryData.productInventory} setView={setView} settings={inventoryData.settings} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-brand-dark dark:text-gray-200">
      <Header setView={setView} currentView={view} theme={theme} toggleTheme={toggleTheme} />
      <main className="p-4 sm:p-6 lg:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
